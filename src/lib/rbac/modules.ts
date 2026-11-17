import type { Role } from "@/db/schema";

export const ACTIONS = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  VIEW: "Ver",
  CREATE: "Criar",
  EDIT: "Editar",
  DELETE: "Excluir",
  APPROVE: "Aprovar",
};

export type ModuleDef = {
  key: string;
  label: string;
  /** Rota do módulo; ausente enquanto o módulo não foi implementado. */
  href?: string;
  /** Fase do cronograma em que o módulo é entregue. */
  phase: number;
  /** Módulos administrativos: exclusivos do administrador principal, não concedíveis. */
  adminOnly: boolean;
  actions: readonly Action[];
  icon: string;
};

const CRUD = ["VIEW", "CREATE", "EDIT", "DELETE"] as const;

export const MODULES = [
  { key: "DASHBOARD", label: "Dashboard", href: "/", phase: 2, adminOnly: false, actions: ["VIEW"], icon: "dashboard" },
  { key: "CLIENTS", label: "Clientes", href: "/clientes", phase: 3, adminOnly: false, actions: CRUD, icon: "clients" },
  { key: "PROJECTS", label: "Projetos", href: "/projetos", phase: 3, adminOnly: false, actions: CRUD, icon: "projects" },
  { key: "PROPOSALS", label: "Propostas comerciais", href: "/propostas", phase: 3, adminOnly: false, actions: CRUD, icon: "proposals" },
  { key: "CONTRACTS", label: "Contratos", href: "/contratos", phase: 3, adminOnly: false, actions: CRUD, icon: "contracts" },
  { key: "WORKFLOW", label: "Tramitação", href: "/tramitacao", phase: 3, adminOnly: false, actions: ["VIEW", "EDIT", "APPROVE"], icon: "workflow" },
  { key: "DISCIPLINES", label: "Disciplinas", href: "/disciplinas", phase: 3, adminOnly: false, actions: CRUD, icon: "disciplines" },
  { key: "TASKS", label: "Tarefas", href: "/tarefas", phase: 3, adminOnly: false, actions: CRUD, icon: "tasks" },
  { key: "FINANCE", label: "Financeiro", phase: 4, adminOnly: false, actions: [...CRUD, "APPROVE"], icon: "finance" },
  { key: "DOCUMENTS", label: "Documentos", phase: 4, adminOnly: false, actions: CRUD, icon: "documents" },
  { key: "CALENDAR", label: "Calendário e prazos", phase: 4, adminOnly: false, actions: CRUD, icon: "calendar" },
  { key: "REPORTS", label: "Relatórios", phase: 4, adminOnly: false, actions: ["VIEW"], icon: "reports" },
  { key: "USERS", label: "Usuários e permissões", href: "/usuarios", phase: 2, adminOnly: true, actions: CRUD, icon: "users" },
  { key: "AUDIT", label: "Auditoria", href: "/auditoria", phase: 2, adminOnly: true, actions: ["VIEW"], icon: "audit" },
  { key: "SETTINGS", label: "Configurações", phase: 4, adminOnly: true, actions: ["VIEW", "EDIT"], icon: "settings" },
] as const satisfies readonly ModuleDef[];

export type ModuleKey = (typeof MODULES)[number]["key"];

export const MODULE_MAP: Record<string, ModuleDef> = Object.fromEntries(MODULES.map((m) => [m.key, m]));

export const GRANTABLE_ROLES = ["OPERACIONAL", "CONSULTA"] as const satisfies readonly Role[];
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN_PRINCIPAL: "Administrador principal",
  OPERACIONAL: "Operacional",
  CONSULTA: "Consulta",
};

export type Grant = { module: string; action: string };
export const grantKey = (module: string, action: string) => `${module}:${action}`;
