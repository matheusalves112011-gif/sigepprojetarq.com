import { type DbOrTx, getDb } from "@/db";
import type { Role } from "@/db/schema";
import { BusinessError } from "@/lib/errors";
import { can } from "./can";
import type { Action, ModuleKey } from "./modules";
import { getRoleGrants } from "./service";

export type Actor = { id: string; role: Role };

/**
 * Verificação de permissão dentro da camada de serviços: mesmo que uma tela ou ação
 * esqueça de checar, a regra de negócio recusa a operação.
 */
export async function authorize(actor: Actor, module: ModuleKey, action: Action, dbOrTx: DbOrTx = getDb()): Promise<Set<string>> {
  const grants = await getRoleGrants(actor.role, dbOrTx);
  if (!can(actor.role, grants, module, action)) {
    throw new BusinessError("Seu perfil não tem permissão para esta operação.", "FORBIDDEN");
  }
  return grants;
}

/**
 * Valores monetários de propostas e contratos só aparecem para quem tem acesso ao Financeiro
 * ou pode criar/editar o próprio módulo.
 */
export function canSeeValues(role: Role, grants: ReadonlySet<string>, module: "PROPOSALS" | "CONTRACTS"): boolean {
  return can(role, grants, "FINANCE", "VIEW") || can(role, grants, module, "EDIT") || can(role, grants, module, "CREATE");
}
