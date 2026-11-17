import { and, asc, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { type DbOrTx, getDb } from "@/db";
import {
  clients,
  contracts,
  type Project,
  projectMembers,
  type ProjectStatus,
  projectStages,
  projects,
  serviceTypes,
  stageTransitions,
  users,
  workflowTemplateStages,
} from "@/db/schema";
import { BusinessError, NO_META, type RequestMeta } from "@/lib/errors";
import { addDays, todayISO } from "@/lib/format";
import { type Actor, authorize } from "@/lib/rbac/guard";
import { nextNumber } from "@/lib/sequence";
import { isoDate, isUuid, likePattern, optDate, optText, optUuid, parse, reqText, reqUuid } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";
import { assertActiveClient } from "@/modules/clients/service";

const common = {
  name: reqText(3, 200, "o nome do projeto"),
  contractId: optUuid,
  location: optText(240),
  description: optText(5000),
  dueDate: optDate,
  responsibleId: reqUuid("o responsável"),
};
export const createProjectSchema = z.object({
  ...common,
  clientId: reqUuid("o cliente"),
  serviceTypeId: reqUuid("a modalidade"),
  startDate: isoDate,
});
export const updateProjectSchema = z.object(common);

const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  ATIVO: ["PAUSADO", "CANCELADO"],
  PAUSADO: ["ATIVO", "CANCELADO"],
  CONCLUIDO: [],
  CANCELADO: [],
};
export const projectNextStatuses = (s: ProjectStatus) => TRANSITIONS[s];

/**
 * Filtro de acesso por projeto: o administrador principal vê todos; os demais só os projetos
 * em que são responsáveis ou foram autorizados (project_members).
 */
export function projectAccessFilter(actor: Actor): SQL | undefined {
  if (actor.role === "ADMIN_PRINCIPAL") return undefined;
  // Nomes qualificados por extenso: em consultas de uma só tabela o Drizzle omite o prefixo das colunas.
  return sql`(projects.responsible_id = ${actor.id} or exists (select 1 from project_members pm where pm.project_id = projects.id and pm.user_id = ${actor.id}))`;
}

/** Carrega o projeto respeitando o acesso. Projeto sem acesso responde como inexistente. */
export async function loadProject(tx: DbOrTx, actor: Actor, id: string, lock = false): Promise<Project> {
  if (!isUuid(id)) throw new BusinessError("Projeto não encontrado.", "NOT_FOUND");
  const query = tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), projectAccessFilter(actor)));
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new BusinessError("Projeto não encontrado.", "NOT_FOUND");
  return row;
}

/** O usuário está ativo e tem acesso ao projeto? (para responsáveis de etapas, disciplinas e tarefas) */
export async function userCanAccessProject(tx: DbOrTx, userId: string, project: { id: string; responsibleId: string }): Promise<boolean> {
  const [u] = await tx.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, userId));
  if (!u || u.status !== "ATIVO") return false;
  if (u.role === "ADMIN_PRINCIPAL" || project.responsibleId === userId) return true;
  const [m] = await tx
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));
  return Boolean(m);
}

export async function assertAssignable(tx: DbOrTx, userId: string | null, project: { id: string; responsibleId: string }): Promise<void> {
  if (!userId) return;
  if (!(await userCanAccessProject(tx, userId, project))) {
    throw new BusinessError("O usuário escolhido está inativo ou não tem acesso a este projeto. Autorize-o na equipe do projeto antes.", "INVALID");
  }
}

async function assertActiveUser(tx: DbOrTx, userId: string): Promise<void> {
  const [u] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId));
  if (!u || u.status !== "ATIVO") throw new BusinessError("O responsável escolhido não existe ou está bloqueado.", "INVALID");
}

async function assertContractUsable(tx: DbOrTx, contractId: string | null, clientId: string): Promise<void> {
  if (!contractId) return;
  const [c] = await tx.select({ status: contracts.status, clientId: contracts.clientId }).from(contracts).where(eq(contracts.id, contractId));
  if (!c) throw new BusinessError("Contrato não encontrado.", "INVALID");
  if (c.clientId !== clientId) throw new BusinessError("O contrato pertence a outro cliente.", "INVALID");
  if (c.status === "CANCELADO" || c.status === "ENCERRADO") {
    throw new BusinessError("Contrato cancelado ou encerrado não pode receber projetos.", "CONFLICT");
  }
}

const responsible = alias(users, "responsible");

export async function listProjects(
  actor: Actor,
  opts: { q?: string; status?: string; stageStatus?: string; clientId?: string; contractId?: string } = {},
) {
  await authorize(actor, "PROJECTS", "VIEW");
  const q = opts.q?.trim();
  const status = (["ATIVO", "PAUSADO", "CONCLUIDO", "CANCELADO"] as const).find((s) => s === opts.status);
  const stage = (["EM_ANDAMENTO", "AGUARDANDO_CLIENTE", "AGUARDANDO_ORGAO"] as const).find((s) => s === opts.stageStatus);
  const rows = await getDb()
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      startDate: projects.startDate,
      dueDate: projects.dueDate,
      clientId: projects.clientId,
      clientName: clients.name,
      serviceTypeName: serviceTypes.name,
      responsibleName: responsible.name,
      stageName: projectStages.name,
      stageStatus: projectStages.status,
      stageDueDate: projectStages.dueDate,
      stagePosition: projectStages.position,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(serviceTypes, eq(serviceTypes.id, projects.serviceTypeId))
    .innerJoin(responsible, eq(responsible.id, projects.responsibleId))
    .leftJoin(projectStages, eq(projectStages.id, projects.currentStageId))
    .where(
      and(
        projectAccessFilter(actor),
        q ? or(ilike(projects.name, likePattern(q)), ilike(projects.code, likePattern(q)), ilike(clients.name, likePattern(q))) : undefined,
        status ? eq(projects.status, status) : undefined,
        stage ? eq(projectStages.status, stage) : undefined,
        isUuid(opts.clientId) ? eq(projects.clientId, opts.clientId) : undefined,
        isUuid(opts.contractId) ? eq(projects.contractId, opts.contractId) : undefined,
      ),
    )
    .orderBy(desc(projects.createdAt))
    .limit(300);
  const today = todayISO();
  return rows.map((r) => ({
    ...r,
    late: r.status === "ATIVO" && ((r.stageDueDate !== null && r.stageDueDate < today) || (r.dueDate !== null && r.dueDate < today)),
  }));
}

/** Projetos acessíveis e em andamento, para campos de seleção (tarefas). */
export async function listProjectOptions(actor: Actor) {
  return getDb()
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(and(projectAccessFilter(actor), or(eq(projects.status, "ATIVO"), eq(projects.status, "PAUSADO"))))
    .orderBy(desc(projects.createdAt));
}

export async function getProject(actor: Actor, id: string) {
  await authorize(actor, "PROJECTS", "VIEW");
  if (!isUuid(id)) return null;
  const db = getDb();
  const [row] = await db
    .select({
      project: projects,
      clientName: clients.name,
      serviceTypeName: serviceTypes.name,
      responsibleName: responsible.name,
      contractNumber: contracts.number,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(serviceTypes, eq(serviceTypes.id, projects.serviceTypeId))
    .innerJoin(responsible, eq(responsible.id, projects.responsibleId))
    .leftJoin(contracts, eq(contracts.id, projects.contractId))
    .where(and(eq(projects.id, id), projectAccessFilter(actor)));
  return row ?? null;
}

export async function createProject(actor: Actor, input: unknown, meta: RequestMeta = NO_META): Promise<Project> {
  await authorize(actor, "PROJECTS", "CREATE");
  const data = parse(createProjectSchema, input);
  if (data.dueDate && data.dueDate < data.startDate) throw new BusinessError("O prazo final não pode ser anterior ao início.", "INVALID");

  return getDb().transaction(async (tx) => {
    await assertActiveClient(tx, data.clientId);
    await assertContractUsable(tx, data.contractId, data.clientId);
    await assertActiveUser(tx, data.responsibleId);
    const [st] = await tx.select().from(serviceTypes).where(eq(serviceTypes.id, data.serviceTypeId));
    if (!st?.active) throw new BusinessError("Modalidade não encontrada.", "INVALID");
    const template = await tx
      .select()
      .from(workflowTemplateStages)
      .where(eq(workflowTemplateStages.templateId, st.workflowTemplateId))
      .orderBy(asc(workflowTemplateStages.position));
    if (template.length === 0) {
      throw new BusinessError(
        `A modalidade "${st.name}" ainda não tem etapas definidas. O administrador deve configurar o fluxo em Tramitação > Fluxos antes de criar projetos.`,
        "CONFLICT",
      );
    }

    const code = await nextNumber(tx, "PRJ");
    const [project] = await tx
      .insert(projects)
      .values({ ...data, code, createdById: actor.id })
      .returning();

    // Prazos das etapas: soma acumulada dos prazos padrão, enquanto todas as etapas anteriores tiverem prazo.
    let elapsed = 0;
    let known = true;
    const now = new Date();
    const stages = await tx
      .insert(projectStages)
      .values(
        template.map((t, i) => {
          known = known && t.defaultDays !== null;
          if (known) elapsed += t.defaultDays ?? 0;
          return {
            projectId: project.id,
            position: t.position,
            name: t.name,
            folderKey: t.folderKey,
            dueDate: known ? addDays(data.startDate, elapsed) : null,
            status: i === 0 ? ("EM_ANDAMENTO" as const) : ("NAO_INICIADA" as const),
            startedAt: i === 0 ? now : null,
          };
        }),
      )
      .returning();
    const first = stages.reduce((a, b) => (a.position <= b.position ? a : b));
    await tx.update(projects).set({ currentStageId: first.id }).where(eq(projects.id, project.id));
    await tx.insert(stageTransitions).values({ projectId: project.id, kind: "INICIO", toStageId: first.id, toStatus: "EM_ANDAMENTO", userId: actor.id });

    const memberIds = new Set([data.responsibleId, ...(actor.role === "ADMIN_PRINCIPAL" ? [] : [actor.id])]);
    await tx.insert(projectMembers).values([...memberIds].map((userId) => ({ projectId: project.id, userId, addedById: actor.id })));

    await recordAudit(tx, { userId: actor.id, action: "PROJETO_CRIADO", entity: "projects", entityId: project.id, after: project, meta });
    return { ...project, currentStageId: first.id };
  });
}

export async function updateProject(actor: Actor, id: string, input: unknown, meta: RequestMeta = NO_META): Promise<Project> {
  await authorize(actor, "PROJECTS", "EDIT");
  const data = parse(updateProjectSchema, input);
  return getDb().transaction(async (tx) => {
    const before = await loadProject(tx, actor, id, true);
    if (before.status === "CANCELADO") throw new BusinessError("Projeto cancelado não pode ser alterado.", "CONFLICT");
    if (data.dueDate && data.dueDate < before.startDate) throw new BusinessError("O prazo final não pode ser anterior ao início.", "INVALID");
    if (data.contractId !== before.contractId) await assertContractUsable(tx, data.contractId, before.clientId);
    if (data.responsibleId !== before.responsibleId) {
      await assertActiveUser(tx, data.responsibleId);
      await tx.insert(projectMembers).values({ projectId: id, userId: data.responsibleId, addedById: actor.id }).onConflictDoNothing();
    }
    const [row] = await tx
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    await recordAudit(tx, { userId: actor.id, action: "PROJETO_ALTERADO", entity: "projects", entityId: id, before, after: row, meta });
    return row;
  });
}

/** Pausar e retomar exigem "Editar"; cancelar exige "Excluir" em Projetos. */
export async function setProjectStatus(actor: Actor, id: string, to: string, meta: RequestMeta = NO_META): Promise<Project> {
  await authorize(actor, "PROJECTS", to === "CANCELADO" ? "DELETE" : "EDIT");
  return getDb().transaction(async (tx) => {
    const before = await loadProject(tx, actor, id, true);
    const target = TRANSITIONS[before.status].find((s) => s === to);
    if (!target) throw new BusinessError("Mudança de situação não permitida para este projeto.", "CONFLICT");
    const [row] = await tx.update(projects).set({ status: target, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    await recordAudit(tx, {
      userId: actor.id,
      action: "PROJETO_SITUACAO_ALTERADA",
      entity: "projects",
      entityId: id,
      before: { status: before.status },
      after: { status: row.status },
      meta,
    });
    return row;
  });
}

export async function listMembers(actor: Actor, projectId: string) {
  const project = await loadProject(getDb(), actor, projectId);
  const rows = await getDb()
    .select({ userId: users.id, name: users.name, role: users.role, status: users.status })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.name));
  return rows.map((r) => ({ ...r, isResponsible: r.userId === project.responsibleId }));
}

/** Usuários que podem ser responsáveis por etapas, disciplinas e tarefas do projeto. */
export async function listAssignableUsers(actor: Actor, projectId: string) {
  const project = await loadProject(getDb(), actor, projectId);
  return getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      and(
        eq(users.status, "ATIVO"),
        sql`(users.role = 'ADMIN_PRINCIPAL' or users.id = ${project.responsibleId} or exists (select 1 from project_members pm where pm.project_id = ${projectId} and pm.user_id = users.id))`,
      ),
    )
    .orderBy(asc(users.name));
}

function assertAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN_PRINCIPAL") throw new BusinessError("Somente o administrador principal define a equipe autorizada do projeto.", "FORBIDDEN");
}

export async function addMember(actor: Actor, projectId: string, userId: string, meta: RequestMeta = NO_META): Promise<void> {
  assertAdmin(actor);
  if (!isUuid(userId)) throw new BusinessError("Selecione o usuário.", "INVALID");
  await getDb().transaction(async (tx) => {
    await loadProject(tx, actor, projectId, true);
    await assertActiveUser(tx, userId);
    const added = await tx.insert(projectMembers).values({ projectId, userId, addedById: actor.id }).onConflictDoNothing().returning();
    if (added.length) {
      await recordAudit(tx, { userId: actor.id, action: "PROJETO_MEMBRO_AUTORIZADO", entity: "projects", entityId: projectId, after: { userId }, meta });
    }
  });
}

export async function removeMember(actor: Actor, projectId: string, userId: string, meta: RequestMeta = NO_META): Promise<void> {
  assertAdmin(actor);
  await getDb().transaction(async (tx) => {
    const project = await loadProject(tx, actor, projectId, true);
    if (project.responsibleId === userId) {
      throw new BusinessError("O responsável pelo projeto não pode ser removido da equipe. Troque o responsável antes.", "CONFLICT");
    }
    const removed = await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning();
    if (removed.length) {
      await recordAudit(tx, { userId: actor.id, action: "PROJETO_MEMBRO_REMOVIDO", entity: "projects", entityId: projectId, before: { userId }, meta });
    }
  });
}
