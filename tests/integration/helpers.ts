import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getPool } from "@/db";
import { getAuth } from "@/lib/auth";
import { OUTBOX_DIR } from "@/lib/mail";
import { signIn } from "@/modules/auth/service";
import { installPrimaryAdmin } from "@/modules/users/service";

export const ADMIN = { name: "Administrador Teste", email: "admin@teste.local", password: "SenhaForte123" };
export const SETUP_TOKEN = "token-de-instalacao-de-teste";

/** Recria o banco de testes do zero aplicando todas as migrações versionadas. */
export async function resetDb(): Promise<void> {
  const pool = getPool();
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await rm(OUTBOX_DIR, { recursive: true, force: true });
}

export async function installAdmin() {
  return installPrimaryAdmin({ token: SETUP_TOKEN, ...ADMIN });
}

export function cookieFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

export async function loginCookie(email: string, password: string): Promise<string> {
  const result = await signIn({ email, password }, new Headers());
  if (!result.ok) throw new Error(`login falhou: ${result.reason}`);
  return cookieFrom(result.headers);
}

export async function sessionOf(cookie: string) {
  return getAuth().api.getSession({ headers: new Headers({ cookie }) });
}

export async function lastMail(): Promise<{ to: string; subject: string; text: string } | null> {
  let files: string[];
  try {
    files = (await readdir(OUTBOX_DIR)).sort();
  } catch {
    return null;
  }
  if (!files.length) return null;
  return JSON.parse(await readFile(path.join(OUTBOX_DIR, files[files.length - 1]), "utf8"));
}

export async function mailCount(): Promise<number> {
  try {
    return (await readdir(OUTBOX_DIR)).length;
  } catch {
    return 0;
  }
}
