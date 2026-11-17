import { config } from "dotenv";
import { afterAll } from "vitest";

// Os testes de integração usam SEMPRE o banco de testes (.env.test), nunca o de desenvolvimento ou produção.
config({ path: ".env.test", override: true, quiet: true });
if (!/_test$/.test(new URL(process.env.DATABASE_URL!).pathname)) {
  throw new Error("Testes de integração exigem um banco cujo nome termine em _test.");
}

afterAll(async () => {
  const { closeDb } = await import("@/db");
  await closeDb();
});
