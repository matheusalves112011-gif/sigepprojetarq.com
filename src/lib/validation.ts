import { z } from "zod";
import { BusinessError } from "./errors";
import { parseMoney } from "./money";

export const blankToNull = (v: unknown) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v);

export const reqText = (min: number, max: number, label: string) =>
  z
    .string({ error: `Informe ${label}` })
    .trim()
    .min(min, `Informe ${label}`)
    .max(max, `Máximo de ${max} caracteres em ${label}`);

export const optText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max, `Máximo de ${max} caracteres`).nullable());

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
export const isoDate = z
  .string({ error: "Informe a data" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .refine(isRealDate, "Data inválida");
export const optDate = z.preprocess(blankToNull, isoDate.nullable());

export const reqUuid = (label: string) => z.uuid({ error: `Selecione ${label}` });
export const optUuid = z.preprocess(blankToNull, z.uuid({ error: "Seleção inválida" }).nullable());

export const money = z.string({ error: "Informe o valor" }).transform((v, ctx) => {
  const parsed = parseMoney(v);
  if (parsed === null) {
    ctx.addIssue({ code: "custom", message: "Valor inválido. Use o formato 1.234,56" });
    return z.NEVER;
  }
  return parsed;
});

/** Valida e devolve os dados; lança BusinessError com a primeira mensagem de validação. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new BusinessError(r.error.issues[0]?.message ?? "Dados inválidos", "INVALID");
  return r.data;
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && z.uuid().safeParse(v).success;

/** Padrão para ILIKE com os curingas do texto do usuário neutralizados. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
