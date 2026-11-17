/**
 * Aplica as migrações versionadas da pasta ./drizzle.
 * Uso: pnpm db:migrate            (usa .env)
 *      ENV_FILE=.env.test pnpm db:migrate
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

config({ path: process.env.ENV_FILE ?? ".env", quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    const { rows } = await pool.query(
      "select count(*)::int as n from drizzle.__drizzle_migrations",
    );
    const db = new URL(url).pathname.slice(1);
    console.log(`Migrações aplicadas no banco "${db}": ${rows[0].n} registradas.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Falha ao migrar:", e);
  process.exit(1);
});
