import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/db";
import { projectStages, projects, serviceTypes, stageTransitions, tasks, users, workflowTemplateStages, workflowTemplates } from "@/db/schema";
import { BusinessError, NO_META, type RequestMeta } from "@/lib/errors";
import { type Actor, authorize } from "@/lib/rbac/guard";
import { isUuid, optDate, optText, optUuid, parse } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";
import { assertAssignable, loadProject } from "@/modules/projects/service";

const noteSchema = optText(1000);

export async function listStages(actor: Actor, projectId: string) {
  await authorize(actor, "WORKFLOW", "VIEW");
  await loadProject(getDb(), actor, projectId);
  return getDb()
    .select({
      id: projectStages.id,
      position: projectStages.position,
      name: projectStages.name,
      status: projectStages.status,
      dueDate: projectStages.dueDate,
      startedAt: projectStages.startedAt,
      completedAt: projectStages.completedAt,
      responsibleId: projectStages.responsibleId,
      responsibleName: users.name,
    })
    .from(projectStages)
    .leftJoin(users, eq(users.id, projectStages.responsibleId))
    .where(eq(projectStages.projectId, projectId))
    .orderBy(asc(projectStages.position));
}

export async function listTransitions(actor: Actor, projectId: string) {
  await authorize(actor, "WORKFLOW", "VIEW");
  await loadProject(getDb(), actor, projectId);
  const from = alias(projectStages, "from_stage");
  const to = alias(projectStages, "to_stage");
  return getDb()
    .select({
      id: stageTransitions.id,
      kind: stageTransitions.kind,
      fromName: from.name,
      toName: to.name,
      fromStatus: stageTransitions.fromStatus,
      toStatus: stageTransitions.toStatus,
      note: stageTransitions.note,
      userName: users.name,
      createdAt: stageTransitions.createdAt,
    })
    .from(stageTransitions)
    .innerJoin(users, eq(users.id, stageTransitions.userId))
    .leftJoin(from, eq(from.id, stageTransitions.fromStageId))
    .leftJoin(to, eq(to.id, stageTransitions.toStageId))
    .where(eq(stageTransitions.projectId, projectId))
    .orderBy(desc(stageTransitions.createdAt));
}

/**
 * Tramita o projeto para a etapa seguinte: conclui a etapa atual e inicia a próxima aplicável.
 * Na última etapa, conclui o projeto. Não avança com tarefas em aberto na etapa atual.
 */
export async function advanceStage(actor: Actor, projectId: string, noteInput: unknown = null, meta: RequestMeta = NO_META) {
  await authorize(actor, "WORKFLOW", "EDIT");
  const note = parse(noteSchema, noteInput);
  return getDb().transaction(async (tx) => {
    const project = await loadProject(tx, actor, projectId, true);
    if (project.status !== "ATIVO") throw new BusinessError("Só projetos ativos podem ser tramitados.", "CONFLICT");
    const stages = await tx.select().from(projectStages).where(eq(projectStages.projectId, projectId)).orderBy(asc(projectStages.position));
    const current = stages.find((s) => s.id === project.currentStageId);
    if (!current) throw new BusinessError("O projeto não tem etapa atual.", "CONFLICT");

    const [{ n }] = await tx
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.stageId, current.id), inArray(tasks.status, ["PENDENTE", "EM_ANDAMENTO"])));
    if (n > 0) {
      throw new BusinessError(`Há ${n} tarefa(s) em aberto na etapa "${current.name}". Conclua ou cancele as tarefas antes de tramitar.`, "CONFLICT");
    }

    const now = new Date();
    await tx.update(projectStages).set({ status: "CONCLUIDA", completedAt: now }).where(eq(projectStages.id, current.id));
    const next = stages.find((s) => s.position > current.position && s.status !== "CANCELADA");

    if (next) {
      await tx
        .update(projectStages)
        .set({ status: "EM_ANDAMENTO", startedAt: next.startedAt ?? now, completedAt: null })
        .where(eq(projectStages.id, next.id));
      await tx.update(projects).set({ currentStageId: next.id, updatedAt: now }).where(eq(projects.id, projectId));
    } else {
      await tx.update(projects).set({ status: "CONCLUIDO", completedAt: now, updatedAt: now }).where(eq(projects.id, projectId));
    }
    await tx.insert(stageTransitions).values({
      projectId,
      kind: next ? "AVANCO" : "CONCLUSAO",
      fromStageId: current.id,
      toStageId: next?.id ?? null,
      fromStatus: current.status,
      toStatus: next ? "EM_ANDAMENTO" : "CONCLUIDA",
      note,
      userId: actor.id,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: next ? "TRAMITACAO_AVANCO" : "PROJETO_CONCLUIDO",
      entity: "projects",
      entityId: projectId,
      before: { etapa: current.name },
      after: { etapa: next?.name ?? null },
      meta,
    });
    return { completed: !next, currentStageName: next?.name ?? null };
  });
}

/** Devolve o projeto à etapa anterior. Exige justificativa e a permissão "Aprovar" em Tramitação. */
export async function returnStage(actor: Actor, projectId: string, noteInput: unknown, meta: RequestMeta = NO_META) {
  await authorize(actor, "WORKFLOW", "APPROVE");
  const note = parse(noteSchema, noteInput);
  if (!note || note.length < 5) throw new BusinessError("Informe o motivo da devolução (mínimo de 5 caracteres).", "INVALID");
  return getDb().transaction(async (tx) => {
    const project = await loadProject(tx, actor, projectId, true);
    if (project.status !== "ATIVO") throw new BusinessError("Só projetos ativos podem ser devolvidos.", "CONFLICT");
    const stages = await tx.select().from(projectStages).where(eq(projectStages.projectId, projectId)).orderBy(asc(projectStages.position));
    const current = stages.find((s) => s.id === project.currentStageId);
    if (!current) throw new BusinessError("O projeto não tem etapa atual.", "CONFLICT");
    const previous = stages.filter((s) => s.position < current.position && s.status !== "CANCELADA").at(-1);
    if (!previous) throw new BusinessError("O projeto já está na primeira etapa.", "CONFLICT");

    const now = new Date();
    await tx.update(projectStages).set({ status: "NAO_INICIADA", startedAt: null, completedAt: null }).where(eq(projectStages.id, current.id));
    await tx.update(projectStages).set({ status: "EM_ANDAMENTO", completedAt: null }).where(eq(projectStages.id, previous.id));
    await tx.update(projects).set({ currentStageId: previous.id, updatedAt: now }).where(eq(projects.id, projectId));
    await tx.insert(stageTransitions).values({
      projectId,
      kind: "DEVOLUCAO",
      fromStageId: current.id,
      toStageId: previous.id,
      fromStatus: current.status,
      toStatus: "EM_ANDAMENTO",
      note,
      userId: actor.id,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: "TRAMITACAO_DEVOLUCAO",
      entity: "projects",
      entityId: projectId,
      before: { etapa: current.name },
      after: { etapa: previous.name, motivo: note },
      meta,
    });
    return { currentStageName: previous.name };
  });
}

const CURRENT_STATUSES = ["EM_ANDAMENTO", "AGUARDANDO_CLIENTE", "AGUARDANDO_ORGAO"] as const;

/** Muda a situação da etapa atual (em andamento, aguardando cliente, aguardando órgão público). */
export async function setCurrentStageStatus(actor: Actor, projectId: string, to: string, noteInput: unknown = null, meta: RequestMeta = NO_META) {
  await authorize(actor, "WORKFLOW", "EDIT");
  const note = parse(noteSchema, noteInput);
  const target = CURRENT_STATUSES.find((s) => s === to);
  if (!target) throw new BusinessError("Situação inválida para a etapa atual.", "INVALID");
  return getDb().transaction(async (tx) => {
    const project = await loadProject(tx, actor, projectId, true);
    if (project.status !== "ATIVO") throw new BusinessError("Só projetos ativos podem ser tramitados.", "CONFLICT");
    const [current] = await tx.select().from(projectStages).where(eq(projectStages.id, project.currentStageId ?? projectId));
    if (!current) throw new BusinessError("O projeto não tem etapa atual.", "CONFLICT");
    if (current.status === target) return;
    await tx.update(projectStages).set({ status: target }).where(eq(projectStages.id, current.id));
    await tx.insert(stageTransitions).values({
      projectId,
      kind: "SITUACAO",
      fromStageId: current.id,
      toStageId: current.id,
      fromStatus: current.status,
      toStatus: target,
      note,
      userId: actor.id,
    });
    await recordAudit(tx, {
      userId: actor.id,
      action: "TRAMITACAO_SITUACAO",
      entity: "project_stages",
      entityId: current.id,
      before: { status: current.status },
      after: { status: target },
      meta,
    });
  });
}

const stageUpdateSchema = z.object({ responsibleId: optUuid, dueDate: optDate });

/** Define responsável e prazo de uma etapa. */
export async function updateStage(actor: Actor, stageId: string, input: unknown, meta: RequestMeta = NO_META) {
  await authorize(actor, "WORKFLOW", "EDIT");
  const data = parse(stageUpdateSchema, input);
  if (!isUuid(stageId)) throw new BusinessError("Etapa não encontrada.", "NOT_FOUND");
  await getDb().transaction(async (tx) => {
    const [stage] = await tx.select().from(projectStages).where(eq(projectStages.id, stageId));
    if (!stage) throw new BusinessError("Etapa não encontrada.", "NOT_FOUND");
    const project = await loadProject(tx, actor, stage.projectId, true);
    if (project.status === "CANCELADO") throw new BusinessError("Projeto cancelado não pode ser alterado.", "CONFLICT");
    if (data.dueDate && data.dueDate < project.startDate) throw new BusinessError("O prazo da etapa não pode ser anterior ao início do projeto.", "INVALID");
    if (data.responsibleId !== stage.responsibleId) await assertAssignable(tx, data.responsibleId, project);
    await tx.update(projectStages).set(data).where(eq(projectStages.id, stageId));
    await recordAudit(tx, {
      userId: actor.id,
      action: "ETAPA_ALTERADA",
      entity: "project_stages",
      entityId: stageId,
      before: { responsibleId: stage.responsibleId, dueDate: stage.dueDate },
      after: data,
      meta,
    });
  });
}

/** Marca uma etapa futura como "não se aplica" (ou a reativa). Exige "Aprovar" em Tramitação. */
export async function setStageApplicable(actor: Actor, stageId: string, applicable: boolean, meta: RequestMeta = NO_META) {
  await authorize(actor, "WORKFLOW", "APPROVE");
  if (!isUuid(stageId)) throw new BusinessError("Etapa não encontrada.", "NOT_FOUND");
  await getDb().transaction(async (tx) => {
    const [stage] = await tx.select().from(projectStages).where(eq(projectStages.id, stageId));
    if (!stage) throw new BusinessError("Etapa não encontrada.", "NOT_FOUND");
    const project = await loadProject(tx, actor, stage.projectId, true);
    if (project.status !== "ATIVO" && project.status !== "PAUSADO") throw new BusinessError("Projeto encerrado não pode ser alterado.", "CONFLICT");
    const expected = applicable ? "CANCELADA" : "NAO_INICIADA";
    if (stage.status !== expected) {
      throw new BusinessError("Só etapas ainda não iniciadas podem ser marcadas como não aplicáveis.", "CONFLICT");
    }
    const status = applicable ? "NAO_INICIADA" : "CANCELADA";
    await tx.update(projectStages).set({ status }).where(eq(projectStages.id, stageId));
    await recordAudit(tx, {
      userId: actor.id,
      action: applicable ? "ETAPA_REATIVADA" : "ETAPA_NAO_APLICAVEL",
      entity: "project_stages",
      entityId: stageId,
      before: { status: stage.status },
      after: { status },
      meta,
    });
  });
}

// ───────────── Fluxos (modelos de etapas por modalidade) ─────────────

export async function listTemplates(actor: Actor) {
  await authorize(actor, "WORKFLOW", "VIEW");
  const db = getDb();
  const [templates, stages, types] = await Promise.all([
    db.select().from(workflowTemplates).orderBy(asc(workflowTemplates.name)),
    db.select().from(workflowTemplateStages).orderBy(asc(workflowTemplateStages.position)),
    db.select({ name: serviceTypes.name, templateId: serviceTypes.workflowTemplateId }).from(serviceTypes),
  ]);
  return templates.map((t) => ({
    ...t,
    stages: stages.filter((s) => s.templateId === t.id),
    serviceTypes: types.filter((s) => s.templateId === t.id).map((s) => s.name),
  }));
}

const templateStagesSchema = z
  .array(
    z.object({
      name: z.string().trim().min(2, "Nome de etapa muito curto").max(120, "Nome de etapa muito longo"),
      defaultDays: z.number().int().min(0).max(3650).nullable(),
    }),
  )
  .max(40, "Máximo de 40 etapas por fluxo");

/**
 * Interpreta o texto da tela de fluxos: uma etapa por linha, com prazo opcional em dias após "|".
 * Ex.: "Vistoria | 5".
 */
export function parseStageLines(text: string): { name: string; defaultDays: number | null }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, days] = line.split("|").map((p) => p.trim());
      if (days === undefined || days === "") return { name, defaultDays: null };
      if (!/^\d{1,4}$/.test(days)) throw new BusinessError(`Prazo inválido na linha "${line}". Use um número de dias.`, "INVALID");
      return { name, defaultDays: Number(days) };
    });
}

/** Substitui as etapas de um fluxo. Vale para projetos novos; projetos existentes não mudam. */
export async function updateTemplateStages(actor: Actor, templateId: string, input: unknown, meta: RequestMeta = NO_META) {
  if (actor.role !== "ADMIN_PRINCIPAL") throw new BusinessError("Somente o administrador principal configura fluxos.", "FORBIDDEN");
  const stages = parse(templateStagesSchema, input);
  if (!isUuid(templateId)) throw new BusinessError("Fluxo não encontrado.", "NOT_FOUND");
  const names = stages.map((s) => s.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new BusinessError("Há etapas com nome repetido no fluxo.", "INVALID");
  await getDb().transaction(async (tx) => {
    const [template] = await tx.select().from(workflowTemplates).where(eq(workflowTemplates.id, templateId)).for("update");
    if (!template) throw new BusinessError("Fluxo não encontrado.", "NOT_FOUND");
    const before = await tx
      .select()
      .from(workflowTemplateStages)
      .where(eq(workflowTemplateStages.templateId, templateId))
      .orderBy(asc(workflowTemplateStages.position));
    const folders = new Map(before.map((s) => [s.name.toLowerCase(), s.folderKey]));
    await tx.delete(workflowTemplateStages).where(eq(workflowTemplateStages.templateId, templateId));
    if (stages.length) {
      await tx.insert(workflowTemplateStages).values(
        stages.map((s, i) => ({
          templateId,
          position: i + 1,
          name: s.name,
          defaultDays: s.defaultDays,
          folderKey: folders.get(s.name.toLowerCase()) ?? null,
        })),
      );
    }
    await tx.update(workflowTemplates).set({ updatedAt: new Date() }).where(eq(workflowTemplates.id, templateId));
    await recordAudit(tx, {
      userId: actor.id,
      action: "FLUXO_ALTERADO",
      entity: "workflow_templates",
      entityId: templateId,
      before: before.map((s) => ({ name: s.name, defaultDays: s.defaultDays })),
      after: stages,
      meta,
    });
  });
}
