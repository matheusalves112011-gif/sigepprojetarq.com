import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// ENV_FILE permite apontar para .env.test; em produção as variáveis vêm do ambiente.
config({ path: process.env.ENV_FILE ?? ".env", quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: false,
});
