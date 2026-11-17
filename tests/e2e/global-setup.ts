import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export const PORT = 3100;
export const BASE = `http://localhost:${PORT}`;

let server: ChildProcess | undefined;

/**
 * Prepara o teste de ponta a ponta: banco de TESTES recriado pelas migrações e o servidor
 * de produção (`next start`, exige `pnpm build` antes) apontado para esse banco.
 */
export async function setup() {
  const env = config({ path: ".env.test", quiet: true }).parsed ?? {};
  if (!/_test$/.test(new URL(env.DATABASE_URL).pathname)) throw new Error("e2e exige banco terminado em _test");

  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
  await rm(".outbox", { recursive: true, force: true });
  await rm("tests/e2e/screenshots", { recursive: true, force: true });
  await mkdir("tests/e2e/screenshots", { recursive: true });

  server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
    env: { ...process.env, ...env, NODE_ENV: "production", APP_URL: BASE, VITEST: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout?.on("data", (d) => (log += d));
  server.stderr?.on("data", (d) => (log += d));
  process.env.E2E_SERVER_LOG = "";

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* ainda subindo */
    }
    if (server.exitCode !== null) throw new Error(`servidor encerrou ao iniciar:\n${log}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`servidor não respondeu em 60 s:\n${log}`);
}

export async function teardown() {
  server?.kill("SIGTERM");
}
