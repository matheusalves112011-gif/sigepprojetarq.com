"use server";

import { type FormState, str } from "@/lib/form";
import { getRequestMeta } from "@/lib/request";
import { requestPasswordReset } from "@/modules/auth/service";

export async function recoverAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requestPasswordReset(str(formData, "email"), await getRequestMeta());
  // Mesma resposta exista ou não a conta, para não revelar quais e-mails estão cadastrados.
  return { success: "Se o e-mail estiver cadastrado e ativo, enviaremos um link para redefinir a senha. Ele vale por 30 minutos." };
}
