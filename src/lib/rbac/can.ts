import type { Role } from "@/db/schema";
import { type Action, type Grant, GRANTABLE_ROLES, grantKey, MODULE_MAP, MODULES, type ModuleKey } from "./modules";

/**
 * Decide se um perfil pode executar uma ação num módulo.
 * Regras fixas, que nenhuma configuração altera:
 *  - ADMIN_PRINCIPAL pode tudo;
 *  - módulos administrativos (adminOnly) são exclusivos do administrador principal;
 *  - CONSULTA nunca passa de "Ver".
 */
export function can(role: Role, grants: ReadonlySet<string>, module: ModuleKey | string, action: Action): boolean {
  const def = MODULE_MAP[module];
  if (!def || !def.actions.includes(action)) return false;
  if (role === "ADMIN_PRINCIPAL") return true;
  if (def.adminOnly) return false;
  if (role === "CONSULTA" && action !== "VIEW") return false;
  return grants.has(grantKey(module, action));
}

/** Matriz inicial aprovada no planejamento (seção 6). */
export const DEFAULT_GRANTS: Record<(typeof GRANTABLE_ROLES)[number], Grant[]> = {
  OPERACIONAL: expand({
    DASHBOARD: ["VIEW"],
    CLIENTS: ["VIEW", "EDIT"],
    PROJECTS: ["VIEW", "EDIT"],
    PROPOSALS: ["VIEW"],
    CONTRACTS: ["VIEW"],
    WORKFLOW: ["VIEW", "EDIT"],
    DISCIPLINES: ["VIEW", "EDIT"],
    TASKS: ["VIEW", "CREATE", "EDIT"],
    DOCUMENTS: ["VIEW", "CREATE"],
    CALENDAR: ["VIEW", "CREATE", "EDIT"],
    REPORTS: ["VIEW"],
  }),
  CONSULTA: expand({
    DASHBOARD: ["VIEW"],
    CLIENTS: ["VIEW"],
    PROJECTS: ["VIEW"],
    WORKFLOW: ["VIEW"],
    DISCIPLINES: ["VIEW"],
    TASKS: ["VIEW"],
    DOCUMENTS: ["VIEW"],
    CALENDAR: ["VIEW"],
    REPORTS: ["VIEW"],
  }),
};

function expand(map: Partial<Record<ModuleKey, Action[]>>): Grant[] {
  return Object.entries(map).flatMap(([module, actions]) => (actions ?? []).map((action) => ({ module, action })));
}

/**
 * Valida um conjunto de permissões antes de gravar. Devolve a lista de problemas (vazia = válido).
 */
export function validateGrants(role: string, grants: Grant[]): string[] {
  const problems: string[] = [];
  if (!(GRANTABLE_ROLES as readonly string[]).includes(role)) {
    return ["As permissões do administrador principal não são configuráveis."];
  }
  const seen = new Set<string>();
  for (const g of grants) {
    const def = MODULE_MAP[g.module];
    if (!def) {
      problems.push(`Módulo desconhecido: ${g.module}`);
      continue;
    }
    if (def.adminOnly) problems.push(`O módulo "${def.label}" é exclusivo do administrador principal.`);
    if (!(def.actions as readonly string[]).includes(g.action)) {
      problems.push(`Ação "${g.action}" não existe no módulo "${def.label}".`);
    }
    if (role === "CONSULTA" && g.action !== "VIEW") {
      problems.push(`O perfil Consulta não pode receber permissão de edição (${def.label}).`);
    }
    seen.add(grantKey(g.module, g.action));
  }
  for (const g of grants) {
    if (g.action !== "VIEW" && !seen.has(grantKey(g.module, "VIEW"))) {
      const label = MODULE_MAP[g.module]?.label ?? g.module;
      problems.push(`Para conceder "${g.action}" em "${label}" é preciso conceder também "Ver".`);
    }
  }
  return [...new Set(problems)];
}

export function normalizeGrants(grants: Grant[]): Grant[] {
  const order = new Map<string, number>(MODULES.map((m, i) => [m.key, i]));
  const unique = new Map(grants.map((g) => [grantKey(g.module, g.action), g]));
  return [...unique.values()].sort(
    (a, b) => (order.get(a.module) ?? 99) - (order.get(b.module) ?? 99) || a.action.localeCompare(b.action),
  );
}
