import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { type DbOrTx, getDb } from "@/db";
import { type Project, projectStages, projects, type Task, tasks, users } from "@/db/schema";
import { BusinessError, NO_META, type RequestMeta } from "@/lib/errors";
import { todayISO } from "@/lib/format";
import { type Actor, authorize } from "@/lib/rbac/guard";
import { isUuid, optDate, optText, optUuid, parse, reqText, reqUuid } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";
import { assertAssignable, loadProject, projectAccessFilter } from "@/modules/projects/service";

const fields = {
  stageId: optUuid,
  title: reqText(3, 200, "o título da tarefa"),
  description: optText(5000),
  assigneeId: optUuid,
  dueDate: optDate,
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"], { error: "Prioridade inválida" }),
};
export const createTaskSchema = z.object({ projectId: reqUuid("o projeto"), ...fields });
export const updateTaskSchema = z.object(fields);

const OPEN = ["PENDENTE", "EM_ANDAMENTO"] as const;
const STATUSES = ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"] as const;
const assignee = alias(users, "assignee");

const base = () =>
  getDb()
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      projectId: tasks.projectId,
      projectCode: projects.code,
      projectName: projects.name,
      projectStatus: projects.status,
      stageId: tasks.stageId,
      stageName: projectStages.name,
      assigneeId: tasks.assigneeId,
      assigneeName: assignee.name,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(projectStages, eq(projectStages.id, tasks.stageId))
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId));

const withLate = <T extends { status: string; dueDate: string | null }>(rows: T[]) => {
  const today = todayISO();
  return rows.map((r) => ({ ...r, late: (r.status === "PENDENTE" || r.status === "EM_ANDAMENTO") && r.dueDate !== null && r.dueDate < today }));
};

/** Lista tarefas dos projetos a que o usuário tem acesso. */
export async function listTasks(actor: Actor, opts: { mine?: boolean; status?: string; projectId?: string; late?: boolean } = {}) {
  await authorize(actor, "TASKS", "VIEW");
  const status = STATUSES.find((s) => s === opts.status);
  const rows = await base()
    .where(
      and(
        projectAccessFilter(actor),
        opts.mine ? eq(tasks.assigneeId, actor.id) : undefined,
        status ? eq(tasks.status, status) : opts.status === "ABERTAS" ? inArray(tasks.status, [...OPEN]) : undefined,
        isUuid(opts.projectId) ? eq(tasks.projectId, opts.projectId) : undefined,
        opts.late ? and(inArray(tasks.status, [...OPEN]), isNotNull(tasks.dueDate), lt(tasks.dueDate, todayISO())) : undefined,
      ),
    )
    .orderBy(sql`${tasks.status} in ('CONCLUIDA','CANCELADA')`, sql`${tasks.dueDate} asc nulls last`, asc(tasks.createdAt))
    .limit(500);
  return withLate(rows);
}

export async function getTask(actor: Actor, id: string) {
  await authorize(actor, "TASKS", "VIEW");
  if (!isUuid(id)) return null;
  const [row] = await base().where(and(eq(tasks.id, id), projectAccessFilter(actor)));
  return row ? withLate([row])[0] : null;
}

async function assertStageOfProject(tx: DbOrTx, stageId: string | null, projectId: string): Promise<void> {
  if (!stageId) return;
  const [s] = await tx.select({ projectId: projectStages.projectId, status: projectStages.status }).from(projectStages).where(eq(projectStages.id, stageId));
  if (!s || s.projectId !== projectId) throw new BusinessError("A etapa escolhida não pertence a este projeto.", "INVALID");
  if (s.status === "CANCELADA") throw new BusinessError("A etapa escolhida foi marcada como não aplicável.", "INVALID");
}

function assertProjectOpen(project: Project): void {
  if (project.status === "CANCELADO" || project.status === "CONCLUIDO") {
    throw new BusinessError("Projeto concluído ou cancelado não recebe alterações de tarefas.", "CONFLICT");
  }
}

export async function createTask(actor: Actor, input: unknown, meta: RequestMeta = NO_META): Promise<Task> {
  await authorize(actor, "TASKS", "CREATE");
  const data = parse(createTaskSchema, input);
  return getDb().transaction(async (tx) => {
    const project = await loadProject(tx, actor, data.projectId, true);
    assertProjectOpen(project);
    await assertStageOfProject(tx, data.stageId, project.id);
    await assertAssignable(tx, data.assigneeId, project);
    const [row] = await tx
      .insert(tasks)
      .values({ ...data, createdById: actor.id })
      .returning();
    await recordAudit(tx, { userId: actor.id, action: "TAREFA_CRIADA", entity: "tasks", entityId: row.id, after: row, meta });
    return row;
  });
}

async function lockTask(tx: DbOrTx, actor: Actor, id: string): Promise<{ task: Task; project: Project }> {
  if (!isUuid(id)) throw new BusinessError("Tarefa não encontrada.", "NOT_FOUND");
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, id)).for("update");
  if (!task) throw new BusinessError("Tarefa não encontrada.", "NOT_FOUND");
  try {
    return { task, project: await loadProject(tx, actor, task.projectId) };
  } catch {
    throw new BusinessError("Tarefa não encontrada.", "NOT_FOUND");
  }
}

export async function updateTask(actor: Actor, id: string, input: unknown, meta: RequestMeta = NO_META): Promise<Task> {
  await authorize(actor, "TASKS", "EDIT");
  const data = parse(updateTaskSchema, input);
  return getDb().transaction(async (tx) => {
    const { task: before, project } = await lockTask(tx, actor, id);
    assertProjectOpen(project);
    if (data.stageId !== before.stageId) await assertStageOfProject(tx, data.stageId, project.id);
    if (data.assigneeId !== before.assigneeId) await assertAssignable(tx, data.assigneeId, project);
    const [row] = await tx
      .update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    await recordAudit(tx, { userId: actor.id, action: "TAREFA_ALTERADA", entity: "tasks", entityId: id, before, after: row, meta });
    return row;
  });
}

export async function setTaskStatus(actor: Actor, id: string, to: string, meta: RequestMeta = NO_META): Promise<Task> {
  await authorize(actor, "TASKS", "EDIT");
  const target = STATUSES.find((s) => s === to);
  if (!target) throw new BusinessError("Situação inválida.", "INVALID");
  return getDb().transaction(async (tx) => {
    const { task: before, project } = await lockTask(tx, actor, id);
    assertProjectOpen(project);
    if (before.status === target) return before;
    const now = new Date();
    const [row] = await tx
      .update(tasks)
      .set({ status: target, completedAt: target === "CONCLUIDA" ? now : null, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning();
    await recordAudit(tx, {
      userId: actor.id,
      action: "TAREFA_SITUACAO_ALTERADA",
      entity: "tasks",
      entityId: id,
      before: { status: before.status },
      after: { status: row.status },
      meta,
    });
    return row;
  });
}

export async function deleteTask(actor: Actor, id: string, meta: RequestMeta = NO_META): Promise<void> {
  await authorize(actor, "TASKS", "DELETE");
  await getDb().transaction(async (tx) => {
    const { task: before } = await lockTask(tx, actor, id);
    await tx.delete(tasks).where(eq(tasks.id, id));
    await recordAudit(tx, { userId: actor.id, action: "TAREFA_EXCLUIDA", entity: "tasks", entityId: id, before, meta });
  });
}
