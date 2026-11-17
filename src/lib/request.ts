import "server-only";
import { headers } from "next/headers";
import type { RequestMeta } from "./errors";

/** IP e navegador da requisição, para a auditoria. Atrás do proxy reverso o IP vem em X-Forwarded-For. */
export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: forwarded || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
}

export async function requestHeaders(): Promise<Headers> {
  return new Headers(await headers());
}
