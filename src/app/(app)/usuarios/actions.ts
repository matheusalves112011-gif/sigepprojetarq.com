"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type FormState, str, toFormError } from "@/lib/form";
import { getRequestMeta } from "@/lib/request";
import { requireAdmin } from "@/lib/session";
import { adminResetPassword, createUser, setUserStatus, updateUser } from "@/modules/users/service";

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const password = str(formData, "password");
  if (password !== str(formData, "confirm")) return { error: "As senhas não conferem." };
  try {
    await createUser(
      actor,
      { name: str(formData, "name"), email: str(formData, "email"), role: str(formData, "role"), password },
      await getRequestMeta(),
    );
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/usuarios");
  redirect("/usuarios?aviso=criado");
}

export async function updateUserAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  try {
    await updateUser(actor, id, { name: str(formData, "name"), role: str(formData, "role") }, await getRequestMeta());
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/usuarios");
  return { success: "Dados atualizados." };
}

export async function setStatusAction(id: string, status: "ATIVO" | "BLOQUEADO", _prev: FormState): Promise<FormState> {
  const actor = await requireAdmin();
  try {
    await setUserStatus(actor, id, status, await getRequestMeta());
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/usuarios");
  return { success: status === "BLOQUEADO" ? "Usuário bloqueado. As sessões dele foram encerradas." : "Usuário reativado." };
}

export async function adminResetPasswordAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const password = str(formData, "password");
  if (password !== str(formData, "confirm")) return { error: "As senhas não conferem." };
  try {
    await adminResetPassword(actor, id, password, await getRequestMeta());
  } catch (e) {
    return toFormError(e);
  }
  return { success: "Senha provisória definida. O usuário deverá trocá-la no próximo acesso." };
}
