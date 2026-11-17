"use server";

import { redirect } from "next/navigation";
import { type FormState, str, toFormError } from "@/lib/form";
import { getRequestMeta } from "@/lib/request";
import { requireUser } from "@/lib/session";
import { changeOwnPassword } from "@/modules/auth/service";

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser({ allowPendingPasswordChange: true });
  const newPassword = str(formData, "newPassword");
  if (newPassword !== str(formData, "confirm")) return { error: "As senhas não conferem." };
  const obrigatoria = user.mustChangePassword;
  try {
    await changeOwnPassword(
      user.id,
      { currentPassword: str(formData, "currentPassword"), newPassword },
      user.sessionId,
      await getRequestMeta(),
    );
  } catch (e) {
    return toFormError(e);
  }
  if (obrigatoria) redirect("/");
  return { success: "Senha alterada. As outras sessões desta conta foram encerradas." };
}
