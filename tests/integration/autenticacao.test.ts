import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { auditLogs, sessions, users } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import {
  changeOwnPassword,
  LOGIN_MAX_FAILURES_PER_EMAIL,
  requestPasswordReset,
  resetPasswordWithToken,
  signIn,
  signOut,
} from "@/modules/auth/service";
import { createUser, setUserStatus } from "@/modules/users/service";
import { ADMIN, cookieFrom, installAdmin, lastMail, loginCookie, mailCount, resetDb, sessionOf } from "./helpers";

let admin: Awaited<ReturnType<typeof installAdmin>>;
const actor = () => ({ id: admin.id, role: admin.role });
const OPER = { name: "Operador Teste", email: "operador@teste.local", role: "OPERACIONAL", password: "Provisoria123" };

beforeEach(async () => {
  await resetDb();
  admin = await installAdmin();
});

const audits = async (action: string) => {
  const [{ n }] = await getDb().select({ n: count() }).from(auditLogs).where(eq(auditLogs.action, action));
  return n;
};

describe("login e sessão", () => {
  it("login correto abre sessão com cookie HttpOnly e registra auditoria", async () => {
    const r = await signIn({ email: ADMIN.email, password: ADMIN.password }, new Headers(), { ip: "10.0.0.1", userAgent: "teste" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const setCookie = r.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/sigep\.session_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const s = await sessionOf(cookieFrom(r.headers));
    expect(s?.user.email).toBe(ADMIN.email);
    expect((s?.user as { role?: string }).role).toBe("ADMIN_PRINCIPAL");
    expect(await audits("LOGIN")).toBe(1);
    const [u] = await getDb().select().from(users).where(eq(users.id, admin.id));
    expect(u.lastLoginAt).not.toBeNull();
  });

  it("e-mail é aceito sem diferenciar maiúsculas e espaços", async () => {
    const r = await signIn({ email: "  ADMIN@Teste.Local ", password: ADMIN.password }, new Headers());
    expect(r.ok).toBe(true);
  });

  it("senha errada e e-mail inexistente dão a mesma resposta e ficam na auditoria", async () => {
    const a = await signIn({ email: ADMIN.email, password: "SenhaErrada999" }, new Headers());
    const b = await signIn({ email: "ninguem@teste.local", password: "SenhaErrada999" }, new Headers());
    expect(a).toEqual({ ok: false, reason: "INVALID" });
    expect(b).toEqual({ ok: false, reason: "INVALID" });
    expect(await audits("LOGIN_FALHA")).toBe(2);
    const [{ n }] = await getDb().select({ n: count() }).from(sessions);
    expect(n).toBe(0);
  });

  it("bloqueia temporariamente após falhas repetidas, mesmo com a senha certa", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES_PER_EMAIL; i++) {
      await signIn({ email: ADMIN.email, password: "SenhaErrada999" }, new Headers());
    }
    const r = await signIn({ email: ADMIN.email, password: ADMIN.password }, new Headers());
    expect(r).toEqual({ ok: false, reason: "THROTTLED" });
  });

  it("sem cookie ou com cookie inválido não há sessão", async () => {
    expect(await getAuth().api.getSession({ headers: new Headers() })).toBeNull();
    expect(await sessionOf("sigep.session_token=forjado.assinatura")).toBeNull();
  });

  it("logout encerra a sessão no servidor", async () => {
    const cookie = await loginCookie(ADMIN.email, ADMIN.password);
    expect(await sessionOf(cookie)).not.toBeNull();
    await signOut(new Headers({ cookie }), admin.id);
    expect(await sessionOf(cookie)).toBeNull();
    expect(await audits("LOGOUT")).toBe(1);
  });

  it("sessão expirada é recusada", async () => {
    const cookie = await loginCookie(ADMIN.email, ADMIN.password);
    await getDb().update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await sessionOf(cookie)).toBeNull();
  });

  it("cadastro público está desativado", async () => {
    await expect(
      getAuth().api.signUpEmail({ body: { name: "Intruso", email: "intruso@teste.local", password: "SenhaForte123" } }),
    ).rejects.toThrow();
    const [{ n }] = await getDb().select({ n: count() }).from(users);
    expect(n).toBe(1);
  });
});

describe("bloqueio de usuário", () => {
  it("bloquear encerra as sessões abertas e impede novo login; reativar devolve o acesso", async () => {
    const oper = await createUser(actor(), OPER);
    const cookie = await loginCookie(OPER.email, OPER.password);
    expect(await sessionOf(cookie)).not.toBeNull();

    await setUserStatus(actor(), oper.id, "BLOQUEADO");
    expect(await sessionOf(cookie)).toBeNull();
    const r = await signIn({ email: OPER.email, password: OPER.password }, new Headers());
    expect(r).toEqual({ ok: false, reason: "BLOCKED" });
    expect(await audits("LOGIN_BLOQUEADO")).toBe(1);

    await setUserStatus(actor(), oper.id, "ATIVO");
    expect((await signIn({ email: OPER.email, password: OPER.password }, new Headers())).ok).toBe(true);
  });
});

describe("recuperação e troca de senha", () => {
  it("envia link de uso único, redefine a senha e encerra sessões antigas", async () => {
    const cookie = await loginCookie(ADMIN.email, ADMIN.password);
    await requestPasswordReset(ADMIN.email);
    const mail = await lastMail();
    expect(mail?.to).toBe(ADMIN.email);
    const token = new URL(mail!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
    expect(token.length).toBeGreaterThan(10);

    await resetPasswordWithToken(token, "NovaSenhaForte456");
    expect(await sessionOf(cookie)).toBeNull();
    expect((await signIn({ email: ADMIN.email, password: ADMIN.password }, new Headers())).ok).toBe(false);
    expect((await signIn({ email: ADMIN.email, password: "NovaSenhaForte456" }, new Headers())).ok).toBe(true);
    await expect(resetPasswordWithToken(token, "OutraSenhaForte789")).rejects.toMatchObject({ code: "INVALID" });
    expect(await audits("SENHA_REDEFINIDA")).toBe(1);
  });

  it("e-mail inexistente e usuário bloqueado não recebem link, sem erro visível", async () => {
    await requestPasswordReset("ninguem@teste.local");
    expect(await mailCount()).toBe(0);
    const oper = await createUser(actor(), OPER);
    await setUserStatus(actor(), oper.id, "BLOQUEADO");
    await requestPasswordReset(OPER.email);
    expect(await mailCount()).toBe(0);
  });

  it("limita a 3 links por hora por conta", async () => {
    for (let i = 0; i < 5; i++) await requestPasswordReset(ADMIN.email);
    expect(await mailCount()).toBe(3);
  });

  it("token inválido e senha fraca são recusados", async () => {
    await expect(resetPasswordWithToken("token-inexistente", "NovaSenhaForte456")).rejects.toMatchObject({ code: "INVALID" });
    await expect(resetPasswordWithToken("qualquer", "fraca")).rejects.toMatchObject({ code: "INVALID" });
  });

  it("troca da própria senha exige a senha atual, zera a troca obrigatória e encerra outras sessões", async () => {
    const oper = await createUser(actor(), OPER);
    expect(oper.mustChangePassword).toBe(true);
    const cookieA = await loginCookie(OPER.email, OPER.password);
    const cookieB = await loginCookie(OPER.email, OPER.password);
    const sA = await sessionOf(cookieA);

    await expect(
      changeOwnPassword(oper.id, { currentPassword: "Errada12345", newPassword: "Definitiva789" }, sA!.session.id),
    ).rejects.toMatchObject({ code: "INVALID" });
    await expect(
      changeOwnPassword(oper.id, { currentPassword: OPER.password, newPassword: OPER.password }, sA!.session.id),
    ).rejects.toMatchObject({ code: "INVALID" });

    await changeOwnPassword(oper.id, { currentPassword: OPER.password, newPassword: "Definitiva789" }, sA!.session.id);
    const [u] = await getDb().select().from(users).where(eq(users.id, oper.id));
    expect(u.mustChangePassword).toBe(false);
    expect(await sessionOf(cookieA)).not.toBeNull();
    expect(await sessionOf(cookieB)).toBeNull();
    expect((await signIn({ email: OPER.email, password: "Definitiva789" }, new Headers())).ok).toBe(true);
    const [{ n }] = await getDb()
      .select({ n: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "SENHA_ALTERADA"), eq(auditLogs.userId, oper.id)));
    expect(n).toBe(1);
  });
});
