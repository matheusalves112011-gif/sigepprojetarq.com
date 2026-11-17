"use server";

import { revalidatePath } from "next/cache";
import { type FormState, toFormError } from "@/lib/form";
import { ROLE_LABELS } from "@/lib/rbac/modules";
import { updateRolePermissions } from "@/lib/rbac/service";
import { getRequestMeta } from "@/lib/request";
import { requireAdmin } from "@/lib/session";

export async function savePermissionsAction(role: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const grants = formData
    .getAll("g")
    .filter((v): v is string => typeof v === "string")
    .map((v) => {
      const [module, action] = v.split(":");
      return { module: module ?? "", action: action ?? "" };
    });
  try {
    await updateRolePermissions(actor, role, grants, await getRequestMeta());
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/", "layout");
  const label = ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role;
  return { success: `Permissões do perfil ${label} salvas. Valem a partir da próxima ação de cada usuário.` };
}
