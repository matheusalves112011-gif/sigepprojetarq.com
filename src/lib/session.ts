import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role, UserStatus } from "@/db/schema";
import { getAuth } from "./auth";
import { can } from "./rbac/can";
import type { Action, ModuleKey } from "./rbac/modules";
import { getRoleGrants } from "./rbac/service";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  sessionId: string;
};

/** Usuário da requisição atual, validado no banco. `null` quando não há sessão válida ou o usuário não está ativo. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const result = await getAuth().api.getSession({ headers: await headers() });
  if (!result) return null;
  const u = result.user as typeof result.user & { role: Role; status: UserStatus; mustChangePassword: boolean };
  if (u.status !== "ATIVO") return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    mustChangePassword: Boolean(u.mustChangePassword),
    sessionId: result.session.id,
  };
});

export const getCurrentGrants = cache(async (role: Role) => getRoleGrants(role));

/** Exige sessão válida. Toda página e toda ação de servidor da área autenticada chama esta função (ou requirePermission). */
export async function requireUser(opts: { allowPendingPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowPendingPasswordChange) redirect("/trocar-senha");
  return user;
}

/** Exige permissão no módulo. A checagem é sempre no servidor; esconder itens na tela é só conveniência. */
export async function requirePermission(module: ModuleKey, action: Action) {
  const user = await requireUser();
  const grants = await getCurrentGrants(user.role);
  if (!can(user.role, grants, module, action)) redirect("/acesso-negado");
  return { user, grants };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN_PRINCIPAL") redirect("/acesso-negado");
  return user;
}
