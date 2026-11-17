import "server-only";
import type { RequestMeta } from "./errors";
import { type FormState, str, toFormError } from "./form";
import { getRequestMeta } from "./request";
import { requireUser, type SessionUser } from "./session";

type Result<T> = { ok: true; value: T } | { ok: false; state: FormState };

/**
 * Executa uma regra de negócio dentro de uma ação de servidor: exige sessão válida,
 * passa o usuário e os dados da requisição e converte erros em mensagem para a tela.
 * A permissão é verificada dentro do serviço chamado.
 */
export async function act<T>(fn: (actor: SessionUser, meta: RequestMeta) => Promise<T>): Promise<Result<T>> {
  const actor = await requireUser();
  try {
    return { ok: true, value: await fn(actor, await getRequestMeta()) };
  } catch (e) {
    return { ok: false, state: toFormError(e) };
  }
}

export const fields = (fd: FormData, keys: readonly string[]): Record<string, string> => Object.fromEntries(keys.map((k) => [k, str(fd, k)]));
