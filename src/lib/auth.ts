import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, sessions, users, verifications } from "@/db/schema";
import { recordAudit } from "@/modules/audit/service";
import { getEnv } from "./env";
import { sendMail } from "./mail";
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from "./password";

export const BLOCKED_MESSAGE = "USUARIO_BLOQUEADO";
export const COOKIE_PREFIX = "sigep";

function createAuth() {
  const env = getEnv();
  const db = getDb();
  const production = env.NODE_ENV === "production";

  return betterAuth({
    appName: "SIGEP PROJETARQ",
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: production && env.APP_URL.startsWith("https://"),
    },
    user: {
      additionalFields: {
        role: { type: "string", input: false, defaultValue: "CONSULTA" },
        status: { type: "string", input: false, defaultValue: "ATIVO" },
        mustChangePassword: { type: "boolean", input: false, defaultValue: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Não existe cadastro público: usuários são criados pela instalação ou pelo administrador.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, user.id));
        if (!row || row.status !== "ATIVO") return; // usuário bloqueado não recebe link
        const link = `${env.APP_URL}/redefinir-senha?token=${encodeURIComponent(token)}`;
        await sendMail({
          to: user.email,
          subject: "SIGEP PROJETARQ — redefinição de senha",
          text:
            `Olá, ${user.name}.\n\n` +
            `Recebemos um pedido para redefinir sua senha no SIGEP PROJETARQ.\n` +
            `Abra o link abaixo em até 30 minutos (uso único):\n\n${link}\n\n` +
            `Se você não fez este pedido, ignore este e-mail.`,
        });
      },
      onPasswordReset: async ({ user }) => {
        await db.update(users).set({ mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, user.id));
        await recordAudit(db, { userId: user.id, action: "SENHA_REDEFINIDA", entity: "users", entityId: user.id });
      },
    },
    session: {
      expiresIn: env.SESSION_HOURS * 60 * 60,
      updateAge: 15 * 60,
    },
    databaseHooks: {
      session: {
        create: {
          // Usuário bloqueado não abre sessão, mesmo com a senha correta.
          before: async (session) => {
            const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, session.userId));
            if (!row || row.status !== "ATIVO") {
              throw new APIError("FORBIDDEN", { message: BLOCKED_MESSAGE });
            }
          },
        },
      },
    },
    // O limite de tentativas de login é feito em modules/auth/service.ts (por conta e por IP, no banco).
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    // Fora do Next (testes de integração) não há cookies() para gravar; lá o cookie vem em returnHeaders.
    plugins: process.env.VITEST ? [] : [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __sigepAuth?: Auth };

export function getAuth(): Auth {
  if (!g.__sigepAuth) g.__sigepAuth = createAuth();
  return g.__sigepAuth;
}
