"use server";

import { redirect } from "next/navigation";
import { type FormState, str, toFormError } from "@/lib/form";
import { getRequestMeta } from "@/lib/request";
import { installPrimaryAdmin } from "@/modules/users/service";

export async function installAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = str(formData, "password");
  if (password !== str(formData, "confirm")) return { error: "As senhas não conferem." };
  try {
    await installPrimaryAdmin(
      { token: str(formData, "token"), name: str(formData, "name"), email: str(formData, "email"), password },
      await getRequestMeta(),
    );
  } catch (e) {
    return toFormError(e);
  }
  redirect("/login?aviso=instalado");
}
