import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, getPool } from "@/db";
import { accounts, auditLogs, rolePermissions, users } from "@/db/schema";
import { BusinessError } from "@/lib/errors";
import { DEFAULT_GRANTS } from "@/lib/rbac/can";
import { installPrimaryAdmin, isInstalled } from "@/modules/users/service";
import { ADMIN, installAdmin, resetDb, SETUP_TOKEN } from "./helpers";

beforeEach(resetDb);

describe("instalação do administrador principal", () => {
  it("banco recém-migrado não tem usuários nem credencial padrão", async () => {
    expect(await isInstalled()).toBe(false);
    const [{ n }] = await getDb().select({ n: count() }).from(accounts);
    expect(n).toBe(0);
  });

  it("recusa código de instalação incorreto e não cria nada", async () => {
    await expect(installPrimaryAdmin({ token: "codigo-errado-000000", ...ADMIN })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await isInstalled()).toBe(false);
  });

  it("recusa senha fraca", async () => {
    await expect(installPrimaryAdmin({ token: SETUP_TOKEN, ...ADMIN, password: "fraca" })).rejects.toBeInstanceOf(BusinessError);
  });

  it("cria o administrador, a senha em hash, a matriz inicial e o registro de auditoria", async () => {
    const admin = await installAdmin();
    expect(admin.role).toBe("ADMIN_PRINCIPAL");
    expect(admin.status).toBe("ATIVO");
    const db = getDb();
    const [account] = await db.select().from(accounts).where(eq(accounts.userId, admin.id));
    expect(account.password?.startsWith("$argon2id$")).toBe(true);
    const [{ n: perms }] = await db.select({ n: count() }).from(rolePermissions);
    expect(perms).toBe(DEFAULT_GRANTS.OPERACIONAL.length + DEFAULT_GRANTS.CONSULTA.length);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "INSTALACAO"));
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0].after)).not.toContain(ADMIN.password);
  });

  it("só funciona uma vez", async () => {
    await installAdmin();
    await expect(installPrimaryAdmin({ token: SETUP_TOKEN, ...ADMIN, email: "outro@teste.local" })).rejects.toMatchObject({ code: "CONFLICT" });
    const [{ n }] = await getDb().select({ n: count() }).from(users);
    expect(n).toBe(1);
  });

  it("duas instalações simultâneas resultam em um único administrador", async () => {
    const results = await Promise.allSettled([
      installPrimaryAdmin({ token: SETUP_TOKEN, ...ADMIN }),
      installPrimaryAdmin({ token: SETUP_TOKEN, ...ADMIN, email: "outro@teste.local" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ n }] = await getDb().select({ n: count() }).from(users);
    expect(n).toBe(1);
  });

  it("o banco impede um segundo administrador principal mesmo por SQL direto", async () => {
    await installAdmin();
    await expect(
      getPool().query("insert into users (name, email, role) values ('Intruso', 'intruso@teste.local', 'ADMIN_PRINCIPAL')"),
    ).rejects.toThrow(/users_single_primary_admin/);
  });

  it("o banco impede e-mail duplicado ignorando maiúsculas", async () => {
    await installAdmin();
    await expect(
      getPool().query("insert into users (name, email, role) values ('Copia', 'ADMIN@teste.local', 'CONSULTA')"),
    ).rejects.toThrow(/users_email_unique/);
  });
});
