import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

// Argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB, 2 iterações, 1 thread).
const ARGON2ID = 2;
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `A senha deve ter ao menos ${PASSWORD_MIN} caracteres`)
  .max(PASSWORD_MAX, `A senha deve ter no máximo ${PASSWORD_MAX} caracteres`)
  .regex(/[A-Za-zÀ-ÿ]/, "A senha deve conter ao menos uma letra")
  .regex(/[0-9]/, "A senha deve conter ao menos um número");
