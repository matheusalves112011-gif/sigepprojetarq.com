import { describe, expect, it } from "vitest";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/password";

describe("senhas", () => {
  it("gera hash Argon2id e nunca guarda a senha em claro", async () => {
    const h = await hashPassword("SenhaForte123");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(h).not.toContain("SenhaForte123");
    expect(await verifyPassword(h, "SenhaForte123")).toBe(true);
    expect(await verifyPassword(h, "SenhaErrada123")).toBe(false);
  });
  it("hashes da mesma senha são diferentes (sal aleatório)", async () => {
    expect(await hashPassword("SenhaForte123")).not.toBe(await hashPassword("SenhaForte123"));
  });
  it("hash inválido não lança erro, apenas não confere", async () => {
    expect(await verifyPassword("nao-e-hash", "x")).toBe(false);
  });
  it("política: mínimo de 10 caracteres, com letra e número", () => {
    expect(passwordSchema.safeParse("curta1").success).toBe(false);
    expect(passwordSchema.safeParse("somenteletras").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890123").success).toBe(false);
    expect(passwordSchema.safeParse("SenhaForte123").success).toBe(true);
  });
});
