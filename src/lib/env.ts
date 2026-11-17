import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET deve ter ao menos 32 caracteres"),
  /** Código de uso único que libera a tela de instalação do administrador principal. */
  SETUP_TOKEN: z.string().min(16).optional(),
  SESSION_HOURS: z.coerce.number().int().min(1).max(72).default(8),
  MAIL_TRANSPORT: z.enum(["smtp", "file", "none"]).default("none"),
  MAIL_FROM: z.string().default("SIGEP PROJETARQ <nao-responda@sigepprojetarq.com>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Lê e valida as variáveis de ambiente na primeira chamada (não no import, para não quebrar o build). */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detalhes = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração de ambiente inválida: ${detalhes}`);
  }
  cached = parsed.data;
  return cached;
}
