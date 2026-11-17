"use server";

import { redirect } from "next/navigation";
import { type FormState, str } from "@/lib/form";
import { getRequestMeta, requestHeaders } from "@/lib/request";
import { signIn } from "@/modules/auth/service";

const MESSAGES = {
  INVALID: "E-mail ou senha inválidos.",
  BLOCKED: "Seu acesso está bloqueado. Procure o administrador do sistema.",
  THROTTLED: "Muitas tentativas sem sucesso. Aguarde 15 minutos e tente novamente.",
} as const;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let destino: string;
  try {
    const result = await signIn(
      { email: str(formData, "email"), password: str(formData, "password") },
      await requestHeaders(),
      await getRequestMeta(),
    );
    if (!result.ok) return { error: MESSAGES[result.reason] };
    destino = result.mustChangePassword ? "/trocar-senha" : "/";
  } catch (e) {
    console.error("[login] erro inesperado:", e);
    return { error: "Não foi possível entrar agora. Tente novamente em instantes." };
  }
  redirect(destino);
}
