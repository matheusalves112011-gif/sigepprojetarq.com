"use server";

import { redirect } from "next/navigation";
import { type FormState, str, toFormError } from "@/lib/form";
import { resetPasswordWithToken } from "@/modules/auth/service";

export async function resetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = str(formData, "password");
  if (password !== str(formData, "confirm")) return { error: "As senhas não conferem." };
  try {
    await resetPasswordWithToken(str(formData, "token"), password);
  } catch (e) {
    return toFormError(e);
  }
  redirect("/login?aviso=senha-redefinida");
}
