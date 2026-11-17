import { AppShell, type NavItem, type NavSection } from "@/components/app-shell";
import { can } from "@/lib/rbac/can";
import { MODULES, ROLE_LABELS } from "@/lib/rbac/modules";
import { getCurrentGrants, requireUser } from "@/lib/session";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const grants = await getCurrentGrants(user.role);

  // O menu mostra apenas o que o perfil pode ver. Módulos ainda não entregues aparecem sem link, com a fase prevista.
  const visible: NavItem[] = MODULES.filter((m) => can(user.role, grants, m.key, "VIEW")).map((m) => ({
    key: m.key,
    label: m.label,
    icon: m.icon,
    href: "href" in m ? m.href : undefined,
    phase: m.phase,
    match: m.key === "USERS" ? ["/permissoes"] : undefined,
  }));
  const pick = (keys: string[]) => visible.filter((i) => keys.includes(i.key));
  const sections: NavSection[] = [
    { title: "Geral", items: pick(["DASHBOARD"]) },
    { title: "Gestão", items: pick(["CLIENTS", "PROPOSALS", "CONTRACTS", "PROJECTS", "WORKFLOW", "DISCIPLINES", "TASKS"]) },
    { title: "Operação", items: pick(["FINANCE", "DOCUMENTS", "CALENDAR", "REPORTS"]) },
    { title: "Administração", items: pick(["USERS", "AUDIT", "SETTINGS"]) },
  ].filter((s) => s.items.length > 0);

  return (
    <AppShell user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }} sections={sections} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
