import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { disciplines, projectDisciplines, users } from "@/db/schema";
import { BusinessError, NO_META, type RequestMeta } from "@/lib/errors";
import { type Actor, authorize } from "@/lib/rbac/guard";
import { isUuid, optText, optUuid, parse, reqText, reqUuid } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";
import { assertAssignable, loadProject } from "@/modules/projects/service";

// ───────────── Cadastro de disciplinas ─────────────

export async function listDisciplines(actor: Actor) {
  await authorize(actor, "DISCIPLINES", "VIEW");
  return getDb()
    .select({
      id: disciplines.id,
      name: disciplines.name,
      active: disciplines.active,
      projects: sql<number>`(select count(*)::int from project_disciplines pd where pd.discipline_id = disciplines.id)`,
    })
    .from(disciplines)
    .orderBy(asc(disciplines.name));
}

export async function createDiscipline(actor: Actor, input: unknown, meta: RequestMeta = NO_META) {
  await authorize(actor, "DISCIPLINES", "CREATE");
  const name = parse(reqText(2, 80, "o nome da disciplina"), input);
  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select({ id: disciplines.id }).from(disciplines).where(sql`lower(${disciplines.name}) = ${name.toLowerCase()}`);
    if (existing) throw new BusinessError("Já existe uma disciplina com este nome.", "CONFLICT");
    const [row] = await tx.insert(disciplines).values({ name }).returning();
    await recordAudit(tx, { userId: actor.id, action: "DISCIPLINA_CRIADA", entity: "disciplines", entityId: row.id, after: row, meta });
    return row;
  });
}

export async function setDisciplineActive(actor: Actor, id: string, active: boolean, meta: RequestMeta = NO_META) {
  await authorize(actor, "DISCIPLINES", "EDIT");
  if (!isUuid(id)) throw new BusinessError("Disciplina não encontrada.", "NOT_FOUND");
  await getDb().transaction(async (tx) => {
    const [row] = await tx.update(disciplines).set({ active }).where(eq(disciplines.id, id)).returning();
    if (!row) throw new BusinessError("Disciplina não encontrada.", "NOT_FOUND");
    await recordAudit(tx, { userId: actor.id, action: active ? "DISCIPLINA_ATIVADA" : "DISCIPLINA_DESATIVADA", entity: "disciplines", entityId: id, meta });
  });
}

/** Só disciplinas nunca usadas em projetos podem ser excluídas; as demais são desativadas. */
export async function deleteDiscipline(actor: Actor, id: string, meta: RequestMeta = NO_META) {
  await authorize(actor, "DISCIPLINES", "DELETE");
  if (!isUuid(id)) throw new BusinessError("Disciplina não encontrada.", "NOT_FOUND");
  await getDb().transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(projectDisciplines).where(eq(projectDisciplines.disciplineId, id));
    if (n > 0) throw new BusinessError("Disciplina já usada em projetos não pode ser excluída. Desative-a.", "CONFLICT");
    const [row] = await tx.delete(disciplines).where(eq(disciplines.id, id)).returning();
    if (!row) throw new BusinessError("Disciplina não encontrada.", "NOT_FOUND");
    await recordAudit(tx, { userId: actor.id, action: "DISCIPLINA_EXCLUIDA", entity: "disciplines", entityId: id, before: row, meta });
  });
}

// ───────────── Disciplinas de um projeto ─────────────

export async function listProjectDisciplines(actor: Actor, projectId: string) {
  await authorize(actor, "DISCIPLINES", "VIEW");
  await loadProject(getDb(), actor, projectId);
  return getDb()
    .select({
      id: projectDisciplines.id,
      disciplineId: projectDisciplines.disciplineId,
      name: disciplines.name,
      status: projectDisciplines.status,
      artNumber: projectDisciplines.artNumber,
      responsibleId: projectDisciplines.responsibleId,
      responsibleName: users.name,
    })
    .from(projectDisciplines)
    .innerJoin(disciplines, eq(disciplines.id, projectDisciplines.disciplineId))
    .leftJoin(users, eq(users.id, projectDisciplines.responsibleId))
    .where(eq(projectDisciplines.projectId, projectId))
    .orderBy(asc(disciplines.name));
}

const addSchema = z.object({ disciplineId: reqUuid("a disciplina"), responsibleId: optUuid });
const updateSchema = z.object({
  responsibleId: optUuid,
  status: z.enum(["NAO_INICIADA", "EM_ANDAMENTO", "CONCLUIDA"], { error: "Situação inválida" }),
  artNumber: optText(60),
});

export async function addProjectDiscipline(actor: Actor, projectId: string, input: unknown, meta: RequestMeta = NO_META) {
  await authorize(actor, "DISCIPLINES", "EDIT");
  const data = parse(addSchema, input);
  return getDb().transaction(async (tx) => {
    const project = await loadProject(tx, actor, projectId, true);
    if (project.status === "CANCELADO" || project.status === "CONCLUIDO") throw new BusinessError("Projeto encerrado não recebe novas disciplinas.", "CONFLICT");
    const [d] = await tx.select().from(disciplines).where(eq(disciplines.id, data.disciplineId));
    if (!d?.active) throw new BusinessError("Disciplina não encontrada ou desativada.", "INVALID");
    const [dup] = await tx
      .select({ id: projectDisciplines.id })
      .from(projectDisciplines)
      .where(and(eq(projectDisciplines.projectId, projectId), eq(projectDisciplines.disciplineId, data.disciplineId)));
    if (dup) throw new BusinessError(`A disciplina "${d.name}" já está neste projeto.`, "CONFLICT");
    await assertAssignable(tx, data.responsibleId, project);
    const [row] = await tx
      .insert(projectDisciplines)
      .values({ projectId, ...data })
      .returning();
    await recordAudit(tx, { userId: actor.id, action: "PROJETO_DISCIPLINA_INCLUIDA", entity: "project_disciplines", entityId: row.id, after: { ...row, disciplina: d.name }, meta });
    return row;
  });
}

async function loadProjectDiscipline(id: string) {
  if (!isUuid(id)) throw new BusinessError("Disciplina do projeto não encontrada.", "NOT_FOUND");
  const [row] = await getDb().select().from(projectDisciplines).where(eq(projectDisciplines.id, id));
  if (!row) throw new BusinessError("Disciplina do projeto não encontrada.", "NOT_FOUND");
  return row;
}

export async function updateProjectDiscipline(actor: Actor, id: string, input: unknown, meta: RequestMeta = NO_META) {
  await authorize(actor, "DISCIPLINES", "EDIT");
  const data = parse(updateSchema, input);
  const before = await loadProjectDiscipline(id);
  await getDb().transaction(async (tx) => {
    const project = await loadProject(tx, actor, before.projectId, true);
    if (project.status === "CANCELADO") throw new BusinessError("Projeto cancelado não pode ser alterado.", "CONFLICT");
    if (data.responsibleId !== before.responsibleId) await assertAssignable(tx, data.responsibleId, project);
    await tx
      .update(projectDisciplines)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectDisciplines.id, id));
    await recordAudit(tx, {
      userId: actor.id,
      action: "PROJETO_DISCIPLINA_ALTERADA",
      entity: "project_disciplines",
      entityId: id,
      before: { responsibleId: before.responsibleId, status: before.status, artNumber: before.artNumber },
      after: data,
      meta,
    });
  });
}

export async function removeProjectDiscipline(actor: Actor, id: string, meta: RequestMeta = NO_META) {
  await authorize(actor, "DISCIPLINES", "DELETE");
  const before = await loadProjectDiscipline(id);
  await getDb().transaction(async (tx) => {
    await loadProject(tx, actor, before.projectId, true);
    await tx.delete(projectDisciplines).where(eq(projectDisciplines.id, id));
    await recordAudit(tx, { userId: actor.id, action: "PROJETO_DISCIPLINA_REMOVIDA", entity: "project_disciplines", entityId: id, before, meta });
  });
}
