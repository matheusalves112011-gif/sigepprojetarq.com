import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, getPool } from "@/db";
import { accounts, auditLogs, users } from "@/db/schema";
import { can, DEFAULT_GRANTS } from "@/lib/rbac/can";
import { getRoleGrantList, getRoleGrants, updateRolePermissions } from "@/lib/rbac/service";
import { signIn } from "@/modules/auth/service";
import { adminResetPassword, createUser, listUsers, setUserStatus, updateUser } from "@/modules/users/service";
import { installAdmin, loginCookie, resetDb, sessionOf } from "./helpers";

let admin: Awaited<ReturnType<typeof installAdmin>>;
const actor = () => ({ id: admin.id, role: admin.role });
const OPER = { name: "Operador Teste", email: "operador@teste.local", role: "OPERACIONAL", password: "Provisoria123" };
const CONS = { name: "Consulta Teste", email: "consulta@teste.local", role: "CONSULTA", password: "Provisoria123" };

beforeEach(async () => {
  await resetDb();
  admin = await installAdmin();
});

const lastAudit = async () => (await getDb().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1))[0];

describe("gestão de usuários", () => {
  it("administrador cria usuário com senha provisória em hash e auditoria sem a senha", async () => {
    const u = await createUser(actor(), OPER, { ip: "10.0.0.9", userAgent: "teste" });
    expect(u).toMatchObject({ role: "OPERACIONAL", status: "ATIVO", mustChangePassword: true, createdById: admin.id });
    const [acc] = await getDb().select().from(accounts).where(eq(accounts.userId, u.id));
    expect(acc.password?.startsWith("$argon2id$")).toBe(true);
    const log = await lastAudit();
    expect(log).toMatchObject({ action: "USUARIO_CRIADO", userId: admin.id, entityId: u.id, ip: "10.0.0.9" });
    expect(JSON.stringify(log)).not.toContain(OPER.password);
    expect(await listUsers()).toHaveLength(2);
  });

  it("recusa e-mail duplicado, dados inválidos e criação de outro administrador", async () => {
    await createUser(actor(), OPER);
    await expect(createUser(actor(), { ...OPER, name: "Outro Nome" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createUser(actor(), { ...CONS, email: "invalido" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(createUser(actor(), { ...CONS, password: "fraca" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(createUser(actor(), { ...CONS, role: "ADMIN_PRINCIPAL" })).rejects.toMatchObject({ code: "INVALID" });
  });

  it("usuário comum não cria, altera, bloqueia nem redefine senha de ninguém", async () => {
    const oper = await createUser(actor(), OPER);
    const cons = await createUser(actor(), CONS);
    const comum = { id: oper.id, role: oper.role };
    await expect(createUser(comum, { ...CONS, email: "x@teste.local" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateUser(comum, cons.id, { name: "Alterado Nome", role: "OPERACIONAL" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setUserStatus(comum, cons.id, "BLOQUEADO")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(adminResetPassword(comum, cons.id, "OutraSenha12345")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("usuário não eleva o próprio perfil", async () => {
    const oper = await createUser(actor(), OPER);
    const comum = { id: oper.id, role: oper.role };
    await expect(updateUser(comum, oper.id, { name: oper.name, role: "OPERACIONAL" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateRolePermissions(comum, "OPERACIONAL", [{ module: "FINANCE", action: "VIEW" }])).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [u] = await getDb().select().from(users).where(eq(users.id, oper.id));
    expect(u.role).toBe("OPERACIONAL");
  });

  it("o administrador principal não pode ser bloqueado nem rebaixado, nem por ele mesmo", async () => {
    await expect(setUserStatus(actor(), admin.id, "BLOQUEADO")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateUser(actor(), admin.id, { name: "Qualquer Nome", role: "CONSULTA" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [u] = await getDb().select().from(users).where(eq(users.id, admin.id));
    expect(u).toMatchObject({ role: "ADMIN_PRINCIPAL", status: "ATIVO" });
  });

  it("mudança de perfil registra antes e depois", async () => {
    const oper = await createUser(actor(), OPER);
    await updateUser(actor(), oper.id, { name: OPER.name, role: "CONSULTA" });
    const log = await lastAudit();
    expect(log.action).toBe("USUARIO_PERFIL_ALTERADO");
    expect(log.before).toMatchObject({ role: "OPERACIONAL" });
    expect(log.after).toMatchObject({ role: "CONSULTA" });
  });

  it("redefinição pelo administrador troca a senha, exige nova troca e derruba sessões", async () => {
    const oper = await createUser(actor(), OPER);
    const cookie = await loginCookie(OPER.email, OPER.password);
    await adminResetPassword(actor(), oper.id, "NovaProvisoria456");
    expect(await sessionOf(cookie)).toBeNull();
    expect((await signIn({ email: OPER.email, password: OPER.password }, new Headers())).ok).toBe(false);
    const r = await signIn({ email: OPER.email, password: "NovaProvisoria456" }, new Headers());
    expect(r.ok && r.mustChangePassword).toBe(true);
  });

  it("identificador inexistente ou malformado resulta em não encontrado", async () => {
    await expect(setUserStatus(actor(), "00000000-0000-4000-8000-000000000000", "BLOQUEADO")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setUserStatus(actor(), "1; drop table users", "BLOQUEADO")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("permissões por perfil", () => {
  it("a instalação grava a matriz inicial aprovada", async () => {
    expect(await getRoleGrantList("OPERACIONAL")).toHaveLength(DEFAULT_GRANTS.OPERACIONAL.length);
    const cons = await getRoleGrants("CONSULTA");
    expect(can("CONSULTA", cons, "PROJECTS", "VIEW")).toBe(true);
    expect(can("CONSULTA", cons, "FINANCE", "VIEW")).toBe(false);
  });

  it("administrador personaliza por módulo e a mudança vale na verificação seguinte, com auditoria", async () => {
    const antes = await getRoleGrants("OPERACIONAL");
    expect(can("OPERACIONAL", antes, "FINANCE", "VIEW")).toBe(false);
    await updateRolePermissions(actor(), "OPERACIONAL", [...DEFAULT_GRANTS.OPERACIONAL, { module: "FINANCE", action: "VIEW" }]);
    const depois = await getRoleGrants("OPERACIONAL");
    expect(can("OPERACIONAL", depois, "FINANCE", "VIEW")).toBe(true);
    const log = await lastAudit();
    expect(log).toMatchObject({ action: "PERMISSOES_ALTERADAS", entityId: "OPERACIONAL", userId: admin.id });
    expect(log.before).not.toContain("FINANCE:VIEW");
    expect(log.after).toContain("FINANCE:VIEW");
  });

  it("recusa conceder módulo administrativo, edição à consulta e alterar o administrador; nada é gravado", async () => {
    await expect(updateRolePermissions(actor(), "OPERACIONAL", [{ module: "USERS", action: "VIEW" }])).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      updateRolePermissions(actor(), "CONSULTA", [{ module: "TASKS", action: "VIEW" }, { module: "TASKS", action: "EDIT" }]),
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(updateRolePermissions(actor(), "ADMIN_PRINCIPAL", [])).rejects.toMatchObject({ code: "INVALID" });
    expect(await getRoleGrantList("OPERACIONAL")).toHaveLength(DEFAULT_GRANTS.OPERACIONAL.length);
    expect(await getRoleGrantList("CONSULTA")).toHaveLength(DEFAULT_GRANTS.CONSULTA.length);
  });
});

describe("auditoria somente de inserção", () => {
  it("o banco recusa UPDATE, DELETE e TRUNCATE em audit_logs", async () => {
    await createUser(actor(), OPER);
    const pool = getPool();
    await expect(pool.query("update audit_logs set action = 'ADULTERADO'")).rejects.toThrow(/somente insercao/);
    await expect(pool.query("delete from audit_logs")).rejects.toThrow(/somente insercao/);
    await expect(pool.query("truncate audit_logs")).rejects.toThrow(/somente insercao/);
    const { rows } = await pool.query("select count(*)::int as n from audit_logs where action = 'ADULTERADO'");
    expect(rows[0].n).toBe(0);
  });

  it("se a alteração falha, o registro de auditoria também não é gravado (mesma transação)", async () => {
    const { rows: antes } = await getPool().query("select count(*)::int as n from audit_logs");
    await expect(createUser(actor(), { ...OPER, email: admin.email })).rejects.toMatchObject({ code: "CONFLICT" });
    const { rows: depois } = await getPool().query("select count(*)::int as n from audit_logs");
    expect(depois[0].n).toBe(antes[0].n);
  });

  it("usuário com histórico não pode ser apagado do banco", async () => {
    await expect(getPool().query("delete from users where id = $1", [admin.id])).rejects.toThrow();
  });
});
