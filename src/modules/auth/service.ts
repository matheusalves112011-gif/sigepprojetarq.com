import { APIError } from "better-auth/api";
import { and, count, eq, gte, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { accounts, auditLogs, sessions, users } from "@/db/schema";
import { BLOCKED_MESSAGE, getAuth } from "@/lib/auth";
import { BusinessError, NO_META, type RequestMeta } from "@/lib/errors";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/password";
import { recordAudit } from "@/modules/audit/service";

export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILURES_PER_EMAIL = 5;
export const LOGIN_MAX_FAILURES_PER_IP = 30;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido").max(254));

export type SignInResult =
  | { ok: true; headers: Headers; userId: string; mustChangePassword: boolean }
  | { ok: false; reason: "INVALID" | "BLOCKED" | "THROTTLED" };

async function failuresSince(since: Date, where: { email?: string; ip?: string }): Promise<number> {
  const cond = where.email ? eq(auditLogs.entityId, where.email) : eq(auditLogs.ip, where.ip!);
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "LOGIN_FALHA"), gte(auditLogs.createdAt, since), cond));
  return n;
}

/**
 * Login por e-mail e senha.
 * Bloqueia temporariamente após falhas repetidas (por conta e por IP), contadas na auditoria.
 * A resposta para e-mail inexistente e senha errada é a mesma.
 */
export async function signIn(
  input: { email: string; password: string },
  reqHeaders: Headers,
  meta: RequestMeta = NO_META,
): Promise<SignInResult> {
  const db = getDb();
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success || !input.password) return { ok: false, reason: "INVALID" };
  const email = parsed.data;

  const since = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000);
  if ((await failuresSince(since, { email })) >= LOGIN_MAX_FAILURES_PER_EMAIL) return { ok: false, reason: "THROTTLED" };
  if (meta.ip && (await failuresSince(since, { ip: meta.ip })) >= LOGIN_MAX_FAILURES_PER_IP) {
    return { ok: false, reason: "THROTTLED" };
  }

  try {
    const { headers, response } = await getAuth().api.signInEmail({
      body: { email, password: input.password },
      headers: reqHeaders,
      returnHeaders: true,
    });
    const userId = response.user.id;
    const [row] = await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ mustChangePassword: users.mustChangePassword });
    await recordAudit(db, { userId, action: "LOGIN", entity: "auth", entityId: email, meta });
    return { ok: true, headers, userId, mustChangePassword: row?.mustChangePassword ?? false };
  } catch (e) {
    if (!(e instanceof APIError)) throw e;
    if (e.message === BLOCKED_MESSAGE) {
      await recordAudit(db, { userId: null, action: "LOGIN_BLOQUEADO", entity: "auth", entityId: email, meta });
      return { ok: false, reason: "BLOCKED" };
    }
    await recordAudit(db, { userId: null, action: "LOGIN_FALHA", entity: "auth", entityId: email, meta });
    return { ok: false, reason: "INVALID" };
  }
}

export async function signOut(reqHeaders: Headers, userId: string, meta: RequestMeta = NO_META): Promise<void> {
  await getAuth().api.signOut({ headers: reqHeaders });
  await recordAudit(getDb(), { userId, action: "LOGOUT", entity: "auth", entityId: userId, meta });
}

/** Sempre conclui sem revelar se o e-mail existe. O link só é enviado a usuário ativo. */
export async function requestPasswordReset(emailInput: string, meta: RequestMeta = NO_META): Promise<void> {
  const parsed = emailSchema.safeParse(emailInput);
  if (!parsed.success) return;
  const email = parsed.data;
  const db = getDb();
  const since = new Date(Date.now() - 60 * 60_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "SENHA_RECUPERACAO_SOLICITADA"), eq(auditLogs.entityId, email), gte(auditLogs.createdAt, since)));
  await recordAudit(db, { userId: null, action: "SENHA_RECUPERACAO_SOLICITADA", entity: "auth", entityId: email, meta });
  if (n >= 3) return; // no máximo 3 links por hora por conta
  try {
    await getAuth().api.requestPasswordReset({ body: { email } });
  } catch (e) {
    console.error("[auth] falha ao solicitar redefinição de senha:", e);
  }
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const pw = passwordSchema.safeParse(newPassword);
  if (!pw.success) throw new BusinessError(pw.error.issues[0].message, "INVALID");
  if (!token) throw new BusinessError("Link inválido ou expirado. Solicite um novo.", "INVALID");
  try {
    await getAuth().api.resetPassword({ body: { newPassword: pw.data, token } });
  } catch (e) {
    if (e instanceof APIError) throw new BusinessError("Link inválido ou expirado. Solicite um novo.", "INVALID");
    throw e;
  }
}

/** Troca da própria senha. Encerra as outras sessões do usuário. */
export async function changeOwnPassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  currentSessionId: string | null,
  meta: RequestMeta = NO_META,
): Promise<void> {
  const pw = passwordSchema.safeParse(input.newPassword);
  if (!pw.success) throw new BusinessError(pw.error.issues[0].message, "INVALID");
  if (input.currentPassword === input.newPassword) {
    throw new BusinessError("A nova senha deve ser diferente da atual.", "INVALID");
  }
  const db = getDb();
  const [account] = await db
    .select({ id: accounts.id, password: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
  if (!account?.password || !(await verifyPassword(account.password, input.currentPassword))) {
    throw new BusinessError("Senha atual incorreta.", "INVALID");
  }
  const hashed = await hashPassword(pw.data);
  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ password: hashed, updatedAt: new Date() }).where(eq(accounts.id, account.id));
    await tx.update(users).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx
      .delete(sessions)
      .where(currentSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)) : eq(sessions.userId, userId));
    await recordAudit(tx, { userId, action: "SENHA_ALTERADA", entity: "users", entityId: userId, meta });
  });
}
