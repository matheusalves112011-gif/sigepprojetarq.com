import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

// Em desenvolvimento o Next recarrega módulos; o pool fica em globalThis para não vazar conexões.
const g = globalThis as unknown as { __sigepPool?: Pool; __sigepDb?: Db };

export function getPool(): Pool {
  if (!g.__sigepPool) {
    g.__sigepPool = new Pool({ connectionString: getEnv().DATABASE_URL, max: 10 });
  }
  return g.__sigepPool;
}

export function getDb(): Db {
  if (!g.__sigepDb) g.__sigepDb = drizzle(getPool(), { schema });
  return g.__sigepDb;
}

export async function closeDb(): Promise<void> {
  const pool = g.__sigepPool;
  g.__sigepPool = undefined;
  g.__sigepDb = undefined;
  if (pool) await pool.end();
}

export { schema };
