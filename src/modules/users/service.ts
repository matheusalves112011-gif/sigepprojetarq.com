import { timingSafeEqual } from "node:crypto";
import { and, asc, count, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Tx } from "@/db";
import { accounts, type Role, sessions, type User, users } from "@/db/schema";
import { getEnv } from "@/lib/env";
import { BusinessError, NO_META, type RequestMeta } from "@/lib/errors";
import { hashPassword, passwordSchema } from "@/lib/password";
import { GRANTABLE_ROLES } from "@/lib/rbac/modules";
import { seedDefaultPermissions } from "@/lib/rbac/service";
import { recordAudit } from "@/modules/audit/service";
import { emailSchema } from "@/modules/auth/service";

export type Actor = { id: string; role: Role };

const nameSchema = z.string().trim().min(3, "Informe o nome completo").max(120);
const roleSchema = z.enum(GRANTABLE_ROLES, { error: "Perfil inválido" });

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
  password: passwordSchema,
});
export const updateUserSchema = z.object({ name: nameSchema, role: roleSchema });
export const installSchema = z.object({
  token: z.string().min(1, "Informe o código de instalação"),
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

function publicView(u: User) {
  return { name: u.name, email: u.email, role: u.role, status: u.status, mustChangePassword: u.mustChangePassword };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos";
}

function assertAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN_PRINCIPAL") {
    throw new BusinessError("Somente o administrador principal gerencia usuários.", "FORBIDDEN");
  }
}

async function insertUserWithPassword(
  tx: Tx,
  data: { name: string; email: string; role: Role; password: string; mustChangePassword: boolean; createdById: string | null },
): Promise<User> {
  const [existing] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${data.email}`);
  if (existing) throw new BusinessError("Já existe um usuário com este e-mail.", "CONFLICT");
  const [user] = await tx
    .insert(users)
    .values({
      name: data.name,
      email: data.email,
      role: data.role,
      emailVerified: true,
      mustChangePassword: data.mustChangePassword,
      createdById: data.createdById,
    })
    .returning();
  await tx.insert(accounts).values({
    userId: user.id,
    accountId: user.id,
    providerId: "credential",
    password: await hashPassword(data.password),
  });
  return user;
}

export async function isInstalled(): Promise<boolean> {
  const [{ n }] = await getDb().select({ n: count() }).from(users);
  return n > 0;
}

/**
 * Instalação de uso único: cria o administrador principal e a matriz inicial de permissões.
 * Exige o código SETUP_TOKEN definido no servidor e só funciona enquanto não houver nenhum usuário.
 */
export async function installPrimaryAdmin(input: unknown, meta: RequestMeta = NO_META): Promise<User> {
  const parsed = installSchema.safeParse(input);
  if (!parsed.success) throw new BusinessError(firstIssue(parsed.error), "INVALID");
  const expected = getEnv().SETUP_TOKEN;
  if (!expected) throw new BusinessError("Instalação desabilitada: SETUP_TOKEN não está definido no servidor.", "FORBIDDEN");
  const a = Buffer.from(parsed.data.token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new BusinessError("Código de instalação incorreto.", "FORBIDDEN");
  }

  return getDb().transaction(async (tx) => {
    // Trava consultiva: duas instalações simultâneas não passam juntas pela checagem abaixo.
    await tx.execute(sql`select pg_advisory_xact_lock(7461001)`);
    const [{ n }] = await tx.select({ n: count() }).from(users);
    if (n > 0) throw new BusinessError("O sistema já foi instalado.", "CONFLICT");
    const user = await insertUserWithPassword(tx, {
      name: parsed.data.name,
      email: parsed.data.email,
      role: "ADMIN_PRINCIPAL",
      password: parsed.data.password,
      mustChangePassword: false,
      createdById: null,
    });
    await seedDefaultPermissions(tx, user.id);
    await recordAudit(tx, { userId: user.id, action: "INSTALACAO", entity: "users", entityId: user.id, after: publicView(user), meta });
    return user;
  });
}

export async function listUsers() {
  const db = getDb();
  const active = db
    .select({ userId: sessions.userId, n: count().as("n") })
    .from(sessions)
    .where(gt(sessions.expiresAt, new Date()))
    .groupBy(sessions.userId)
    .as("active");
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      activeSessions: sql<number>`coalesce(${active.n}, 0)::int`,
    })
    .from(users)
    .leftJoin(active, eq(active.userId, users.id))
    .orderBy(asc(users.name));
}

export async function getUser(id: string): Promise<User | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [user] = await getDb().select().from(users).where(eq(users.id, id));
  return user ?? null;
}

/** Cria usuário Operacional ou Consulta com senha provisória (troca obrigatória no primeiro acesso). */
export async function createUser(actor: Actor, input: unknown, meta: RequestMeta = NO_META): Promise<User> {
  assertAdmin(actor);
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) throw new BusinessError(firstIssue(parsed.error), "INVALID");
  return getDb().transaction(async (tx) => {
    const user = await insertUserWithPassword(tx, { ...parsed.data, mustChangePassword: true, createdById: actor.id });
    await recordAudit(tx, { userId: actor.id, action: "USUARIO_CRIADO", entity: "users", entityId: user.id, after: publicView(user), meta });
    return user;
  });
}

async function loadTarget(tx: Tx, id: string): Promise<User> {
  if (!z.uuid().safeParse(id).success) throw new BusinessError("Usuário não encontrado.", "NOT_FOUND");
  const [user] = await tx.select().from(users).where(eq(users.id, id)).for("update");
  if (!user) throw new BusinessError("Usuário não encontrado.", "NOT_FOUND");
  return user;
}

function assertNotPrimaryAdmin(target: User, what: string): void {
  if (target.role === "ADMIN_PRINCIPAL") {
    throw new BusinessError(`O administrador principal não pode ${what}.`, "FORBIDDEN");
  }
}

export async function updateUser(actor: Actor, id: string, input: unknown, meta: RequestMeta = NO_META): Promise<User> {
  assertAdmin(actor);
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) throw new BusinessError(firstIssue(parsed.error), "INVALID");
  return getDb().transaction(async (tx) => {
    const target = await loadTarget(tx, id);
    assertNotPrimaryAdmin(target, "ter o perfil alterado");
    const [updated] = await tx
      .update(users)
      .set({ name: parsed.data.name, role: parsed.data.role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    await recordAudit(tx, {
      userId: actor.id,
      action: target.role !== updated.role ? "USUARIO_PERFIL_ALTERADO" : "USUARIO_ALTERADO",
      entity: "users",
      entityId: id,
      before: publicView(target),
      after: publicView(updated),
      meta,
    });
    return updated;
  });
}

/** Bloqueia ou reativa. O bloqueio encerra imediatamente todas as sessões do usuário. */
export async function setUserStatus(
  actor: Actor,
  id: string,
  status: "ATIVO" | "BLOQUEADO",
  meta: RequestMeta = NO_META,
): Promise<User> {
  assertAdmin(actor);
  if (status !== "ATIVO" && status !== "BLOQUEADO") throw new BusinessError("Situação inválida.", "INVALID");
  return getDb().transaction(async (tx) => {
    const target = await loadTarget(tx, id);
    assertNotPrimaryAdmin(target, "ser bloqueado");
    if (target.status === status) return target;
    const [updated] = await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    if (status === "BLOQUEADO") await tx.delete(sessions).where(eq(sessions.userId, id));
    await recordAudit(tx, {
      userId: actor.id,
      action: status === "BLOQUEADO" ? "USUARIO_BLOQUEADO" : "USUARIO_REATIVADO",
      entity: "users",
      entityId: id,
      before: publicView(target),
      after: publicView(updated),
      meta,
    });
    return updated;
  });
}

/** O administrador define nova senha provisória; o usuário troca no próximo acesso. */
export async function adminResetPassword(actor: Actor, id: string, newPassword: string, meta: RequestMeta = NO_META): Promise<void> {
  assertAdmin(actor);
  const pw = passwordSchema.safeParse(newPassword);
  if (!pw.success) throw new BusinessError(firstIssue(pw.error), "INVALID");
  const hashed = await hashPassword(pw.data);
  await getDb().transaction(async (tx) => {
    const target = await loadTarget(tx, id);
    if (target.id === actor.id) throw new BusinessError("Para trocar a própria senha use a tela Minha conta.", "INVALID");
    await tx
      .update(accounts)
      .set({ password: hashed, updatedAt: new Date() })
      .where(and(eq(accounts.userId, id), eq(accounts.providerId, "credential")));
    await tx.update(users).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(users.id, id));
    await tx.delete(sessions).where(eq(sessions.userId, id));
    await recordAudit(tx, { userId: actor.id, action: "USUARIO_SENHA_REDEFINIDA_PELO_ADMIN", entity: "users", entityId: id, meta });
  });
}

export async function userStats() {
  const db = getDb();
  const [[u], [s]] = await Promise.all([
    db
      .select({
        ativos: sql<number>`count(*) filter (where ${users.status} = 'ATIVO')::int`,
        bloqueados: sql<number>`count(*) filter (where ${users.status} = 'BLOQUEADO')::int`,
      })
      .from(users),
    db.select({ n: count() }).from(sessions).where(gt(sessions.expiresAt, new Date())),
  ]);
  return { ativos: u.ativos, bloqueados: u.bloqueados, sessoesAtivas: s.n };
}
