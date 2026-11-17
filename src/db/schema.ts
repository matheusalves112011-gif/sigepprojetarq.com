import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  numeric,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Perfis fixos do sistema. Existe no máximo um ADMIN_PRINCIPAL (índice parcial abaixo). */
export const userRole = pgEnum("user_role", ["ADMIN_PRINCIPAL", "OPERACIONAL", "CONSULTA"]);
export const userStatus = pgEnum("user_status", ["ATIVO", "BLOQUEADO"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRole("role").notNull().default("CONSULTA"),
    status: userStatus("status").notNull().default("ATIVO"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: ts("last_login_at"),
    createdById: uuid("created_by_id").references((): AnyPgColumn => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    uniqueIndex("users_single_primary_admin").on(t.role).where(sql`${t.role} = 'ADMIN_PRINCIPAL'`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

/** Credenciais. providerId = "credential" guarda o hash Argon2id da senha. */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_provider_user_unique").on(t.providerId, t.userId)],
);

/** Tokens de uso único (recuperação de senha). */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/** Uma linha = uma permissão concedida ao perfil. ADMIN_PRINCIPAL não usa esta tabela (acesso integral em código). */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: userRole("role").notNull(),
    module: text("module").notNull(),
    action: text("action").notNull(),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "restrict" }),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.role, t.module, t.action] })],
);

/** Auditoria: somente inserção (gatilho na migração 0001 bloqueia UPDATE, DELETE e TRUNCATE). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_entity_idx").on(t.entity, t.entityId),
    index("audit_user_idx").on(t.userId),
    index("audit_action_idx").on(t.action, t.createdAt),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "restrict" }),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ───────────────────────────── Fase 3: gestão ─────────────────────────────

const day = (name: string) => date(name, { mode: "string" });
const moneyCol = (name: string) => numeric(name, { precision: 14, scale: 2 });

export const personType = pgEnum("person_type", ["PF", "PJ"]);
export const proposalStatus = pgEnum("proposal_status", ["RASCUNHO", "ENVIADA", "ACEITA", "RECUSADA"]);
export const contractStatus = pgEnum("contract_status", ["RASCUNHO", "VIGENTE", "ENCERRADO", "CANCELADO"]);
export const projectStatus = pgEnum("project_status", ["ATIVO", "PAUSADO", "CONCLUIDO", "CANCELADO"]);
export const stageStatus = pgEnum("stage_status", [
  "NAO_INICIADA",
  "EM_ANDAMENTO",
  "AGUARDANDO_CLIENTE",
  "AGUARDANDO_ORGAO",
  "CONCLUIDA",
  "CANCELADA",
]);
export const transitionKind = pgEnum("transition_kind", ["INICIO", "AVANCO", "DEVOLUCAO", "SITUACAO", "CONCLUSAO"]);
export const disciplineStatus = pgEnum("discipline_status", ["NAO_INICIADA", "EM_ANDAMENTO", "CONCLUIDA"]);
export const taskStatus = pgEnum("task_status", ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]);
export const taskPriority = pgEnum("task_priority", ["BAIXA", "MEDIA", "ALTA", "URGENTE"]);

/** Numeradores (propostas, contratos, projetos) por ano. */
export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
});

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: personType("type").notNull(),
    name: text("name").notNull(),
    /** CPF (11 dígitos) ou CNPJ (14 caracteres, numérico ou alfanumérico), sem pontuação. */
    document: text("document"),
    email: text("email"),
    phone: text("phone"),
    contactName: text("contact_name"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("clients_document_unique").on(t.document).where(sql`${t.document} is not null`),
    index("clients_name_idx").on(t.name),
  ],
);

export const workflowTemplates = pgTable("workflow_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const workflowTemplateStages = pgTable(
  "workflow_template_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => workflowTemplates.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    defaultDays: integer("default_days"),
    /** Subpasta padrão do OneDrive vinculada à etapa (usada na Fase 4). */
    folderKey: text("folder_key"),
  },
  (t) => [uniqueIndex("workflow_template_stage_pos").on(t.templateId, t.position)],
);

/** Modalidades de serviço; cada uma aponta para o fluxo de etapas usado nos seus projetos. */
export const serviceTypes = pgTable("service_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
  workflowTemplateId: uuid("workflow_template_id").notNull().references(() => workflowTemplates.id, { onDelete: "restrict" }),
});

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
    serviceTypeId: uuid("service_type_id").notNull().references(() => serviceTypes.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    value: moneyCol("value").notNull(),
    validUntil: day("valid_until"),
    status: proposalStatus("status").notNull().default("RASCUNHO"),
    sentAt: ts("sent_at"),
    decidedAt: ts("decided_at"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("proposals_client_idx").on(t.clientId), index("proposals_status_idx").on(t.status)],
);

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
    /** Uma proposta aceita origina no máximo um contrato. */
    proposalId: uuid("proposal_id").unique().references(() => proposals.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    value: moneyCol("value").notNull(),
    signedAt: day("signed_at"),
    startDate: day("start_date"),
    endDate: day("end_date"),
    status: contractStatus("status").notNull().default("RASCUNHO"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("contracts_client_idx").on(t.clientId), index("contracts_status_idx").on(t.status)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
    contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "restrict" }),
    serviceTypeId: uuid("service_type_id").notNull().references(() => serviceTypes.id, { onDelete: "restrict" }),
    location: text("location"),
    description: text("description"),
    status: projectStatus("status").notNull().default("ATIVO"),
    startDate: day("start_date").notNull(),
    dueDate: day("due_date"),
    responsibleId: uuid("responsible_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    currentStageId: uuid("current_stage_id").references((): AnyPgColumn => projectStages.id, { onDelete: "set null" }),
    completedAt: ts("completed_at"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("projects_client_idx").on(t.clientId),
    index("projects_status_idx").on(t.status),
    index("projects_responsible_idx").on(t.responsibleId),
  ],
);

/** Projetos autorizados por usuário (além do responsável e do administrador principal). */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    addedById: uuid("added_by_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("project_members_user_idx").on(t.userId)],
);

export const projectStages = pgTable(
  "project_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references((): AnyPgColumn => projects.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    folderKey: text("folder_key"),
    responsibleId: uuid("responsible_id").references(() => users.id, { onDelete: "restrict" }),
    dueDate: day("due_date"),
    status: stageStatus("status").notNull().default("NAO_INICIADA"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
  },
  (t) => [uniqueIndex("project_stage_pos").on(t.projectId, t.position), index("project_stages_status_idx").on(t.status)],
);

/** Histórico de tramitação: somente inserção (gatilho na migração de dados de referência). */
export const stageTransitions = pgTable(
  "stage_transitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
    kind: transitionKind("kind").notNull(),
    fromStageId: uuid("from_stage_id").references(() => projectStages.id, { onDelete: "restrict" }),
    toStageId: uuid("to_stage_id").references(() => projectStages.id, { onDelete: "restrict" }),
    fromStatus: stageStatus("from_status"),
    toStatus: stageStatus("to_status"),
    note: text("note"),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("stage_transitions_project_idx").on(t.projectId, t.createdAt)],
);

export const disciplines = pgTable("disciplines", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const projectDisciplines = pgTable(
  "project_disciplines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    disciplineId: uuid("discipline_id").notNull().references(() => disciplines.id, { onDelete: "restrict" }),
    responsibleId: uuid("responsible_id").references(() => users.id, { onDelete: "restrict" }),
    status: disciplineStatus("status").notNull().default("NAO_INICIADA"),
    artNumber: text("art_number"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("project_discipline_unique").on(t.projectId, t.disciplineId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
    stageId: uuid("stage_id").references(() => projectStages.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "restrict" }),
    dueDate: day("due_date"),
    priority: taskPriority("priority").notNull().default("MEDIA"),
    status: taskStatus("status").notNull().default("PENDENTE"),
    completedAt: ts("completed_at"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "restrict" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("tasks_project_idx").on(t.projectId),
    index("tasks_assignee_idx").on(t.assigneeId, t.status),
    index("tasks_due_idx").on(t.dueDate),
  ],
);

export type Client = typeof clients.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectStage = typeof projectStages.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type ProposalStatus = (typeof proposalStatus.enumValues)[number];
export type ContractStatus = (typeof contractStatus.enumValues)[number];
export type ProjectStatus = (typeof projectStatus.enumValues)[number];
export type StageStatus = (typeof stageStatus.enumValues)[number];
export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type TaskPriority = (typeof taskPriority.enumValues)[number];

export type User = typeof users.$inferSelect;
export type Role = (typeof userRole.enumValues)[number];
export type UserStatus = (typeof userStatus.enumValues)[number];
export type AuditLog = typeof auditLogs.$inferSelect;
