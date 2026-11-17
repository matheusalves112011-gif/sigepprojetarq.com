import { BusinessError } from "./errors";

export type FormState = { error?: string; success?: string };

/** Converte exceções em mensagem segura para a tela. Erros inesperados vão para o log, não para o usuário. */
export function toFormError(e: unknown): FormState {
  if (e instanceof BusinessError) return { error: e.message };
  console.error("[action] erro inesperado:", e);
  return { error: "Ocorreu um erro inesperado. Tente novamente; se persistir, avise o administrador." };
}

export const str = (fd: FormData, key: string): string => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
