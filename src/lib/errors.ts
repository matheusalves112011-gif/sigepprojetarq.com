/** Erro de regra de negócio com mensagem segura para exibir ao usuário. */
export class BusinessError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID"
      | "THROTTLED"
      | "BLOCKED" = "INVALID",
  ) {
    super(message);
    this.name = "BusinessError";
  }
}

export type RequestMeta = { ip: string | null; userAgent: string | null };
export const NO_META: RequestMeta = { ip: null, userAgent: null };
