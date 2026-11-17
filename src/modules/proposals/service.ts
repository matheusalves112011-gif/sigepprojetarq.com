import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { type DbOrTx, getDb } from "@/db";
import { clients, contracts, type Proposal, type ProposalStatus, proposals, serviceTypes } from "@/db/schema";
import { BusinessError, NO_META, type RequestMeta } from "@/lib/errors";
import { todayISO } from "@/lib/format";
import { type Actor, authorize, canSeeValues } from "@/lib/rbac/guard";
import { nextNumber } from "@/lib/sequence";
import { isUuid, likePattern, money, optDate, optText, parse, reqText, reqUuid } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";
import { assertActiveClient } from "@/modules/clients/service";

export const proposalSchema = z.object({
  clientId: reqUuid("o cliente"),
  serviceTypeId: reqUuid("a modalidade"),
  title: reqText(3, 200, "o objeto da proposta"),
  description: optText(5000),
  value: money,
  validUntil: optDate,
});

/** Mudanças de situação permitidas. */
const TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  RASCUNHO: ["ENVIADA"],
  ENVIADA: ["ACEITA", "RECUSADA", "RASCUNHO"],
  ACEITA: [],
  RECUSADA: [],
};
export const proposalNextStatuses = (s: ProposalStatus) => TRANSITIONS[s];

export const isExpired = (p: { status: ProposalStatus; validUntil: string | null }) =>
  p.status === "ENVIADA" && p.validUntil !== null && p.validUntil < todayISO();

const base = () =>
  getDb()
    .select({
      id: proposals.id,
      number: proposals.number,
      title: proposals.title,
      description: proposals.description,
      value: proposals.value,
      validUntil: proposals.validUntil,
      status: proposals.status,
      sentAt: proposals.sentAt,
      decidedAt: proposals.decidedAt,
      createdAt: proposals.createdAt,
      clientId: proposals.clientId,
      clientName: clients.name,
      serviceTypeId: proposals.serviceTypeId,
      serviceTypeName: serviceTypes.name,
      contractId: contracts.id,
      contractNumber: contracts.number,
    })
    .from(proposals)
    .innerJoin(clients, eq(clients.id, proposals.clientId))
    .innerJoin(serviceTypes, eq(serviceTypes.id, proposals.serviceTypeId))
    .leftJoin(contracts, eq(contracts.proposalId, proposals.id));

export async function listProposals(actor: Actor, opts: { q?: string; status?: string; clientId?: string } = {}) {
  const grants = await authorize(actor, "PROPOSALS", "VIEW");
  const showValues = canSeeValues(actor.role, grants, "PROPOSALS");
  const q = opts.q?.trim();
  const status = (["RASCUNHO", "ENVIADA", "ACEITA", "RECUSADA"] as const).find((s) => s === opts.status);
  const rows = await base()
    .where(
      and(
        q ? or(ilike(proposals.title, likePattern(q)), ilike(proposals.number, likePattern(q)), ilike(clients.name, likePattern(q))) : undefined,
        status ? eq(proposals.status, status) : undefined,
        isUuid(opts.clientId) ? eq(proposals.clientId, opts.clientId) : undefined,
      ),
    )
    .orderBy(desc(proposals.createdAt))
    .limit(300);
  return rows.map((r) => ({ ...r, value: showValues ? r.value : null, expired: isExpired(r) }));
}

export async function getProposal(actor: Actor, id: string) {
  const grants = await authorize(actor, "PROPOSALS", "VIEW");
  if (!isUuid(id)) return null;
  const [row] = await base().where(eq(proposals.id, id));
  if (!row) return null;
  return { ...row, value: canSeeValues(actor.role, grants, "PROPOSALS") ? row.value : null, expired: isExpired(row) };
}

async function assertServiceType(tx: DbOrTx, id: string): Promise<void> {
  const [st] = await tx.select({ active: serviceTypes.active }).from(serviceTypes).where(eq(serviceTypes.id, id));
  if (!st?.active) throw new BusinessError("Modalidade não encontrada.", "INVALID");
}

export async function createProposal(actor: Actor, input: unknown, meta: RequestMeta = NO_META): Promise<Proposal> {
  await authorize(actor, "PROPOSALS", "CREATE");
  const data = parse(proposalSchema, input);
  return getDb().transaction(async (tx) => {
    await assertActiveClient(tx, data.clientId);
    await assertServiceType(tx, data.serviceTypeId);
    const number = await nextNumber(tx, "PROP");
    const [row] = await tx
      .insert(proposals)
      .values({ ...data, number, createdById: actor.id })
      .returning();
    await recordAudit(tx, { userId: actor.id, action: "PROPOSTA_CRIADA", entity: "proposals", entityId: row.id, after: row, meta });
    return row;
  });
}

async function lockProposal(tx: DbOrTx, id: string): Promise<Proposal> {
  if (!isUuid(id)) throw new BusinessError("Proposta não encontrada.", "NOT_FOUND");
  const [row] = await tx.select().from(proposals).where(eq(proposals.id, id)).for("update");
  if (!row) throw new BusinessError("Proposta não encontrada.", "NOT_FOUND");
  return row;
}

export async function updateProposal(actor: Actor, id: string, input: unknown, meta: RequestMeta = NO_META): Promise<Proposal> {
  await authorize(actor, "PROPOSALS", "EDIT");
  const data = parse(proposalSchema, input);
  return getDb().transaction(async (tx) => {
    const before = await lockProposal(tx, id);
    if (before.status !== "RASCUNHO") {
      throw new BusinessError("Só é possível alterar propostas em rascunho. Volte a proposta para rascunho antes.", "CONFLICT");
    }
    await assertActiveClient(tx, data.clientId);
    await assertServiceType(tx, data.serviceTypeId);
    const [row] = await tx
      .update(proposals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(proposals.id, id))
      .returning();
    await recordAudit(tx, { userId: actor.id, action: "PROPOSTA_ALTERADA", entity: "proposals", entityId: id, before, after: row, meta });
    return row;
  });
}

export async function setProposalStatus(actor: Actor, id: string, to: string, meta: RequestMeta = NO_META): Promise<Proposal> {
  await authorize(actor, "PROPOSALS", "EDIT");
  return getDb().transaction(async (tx) => {
    const before = await lockProposal(tx, id);
    const target = TRANSITIONS[before.status].find((s) => s === to);
    if (!target) throw new BusinessError("Mudança de situação não permitida para esta proposta.", "CONFLICT");
    const today = todayISO();
    if (target === "ENVIADA") {
      if (Number(before.value) <= 0) throw new BusinessError("Informe um valor maior que zero antes de enviar a proposta.", "INVALID");
      if (before.validUntil && before.validUntil < today) throw new BusinessError("A validade da proposta já passou. Atualize a data antes de enviar.", "INVALID");
    }
    if (target === "ACEITA" && before.validUntil && before.validUntil < today) {
      throw new BusinessError("Proposta vencida não pode ser aceita. Volte para rascunho e atualize a validade.", "CONFLICT");
    }
    const now = new Date();
    const [row] = await tx
      .update(proposals)
      .set({
        status: target,
        sentAt: target === "ENVIADA" ? now : target === "RASCUNHO" ? null : before.sentAt,
        decidedAt: target === "ACEITA" || target === "RECUSADA" ? now : null,
        updatedAt: now,
      })
      .where(eq(proposals.id, id))
      .returning();
    await recordAudit(tx, {
      userId: actor.id,
      action: "PROPOSTA_SITUACAO_ALTERADA",
      entity: "proposals",
      entityId: id,
      before: { status: before.status },
      after: { status: row.status },
      meta,
    });
    return row;
  });
}

/** Só rascunhos são excluídos; propostas enviadas ficam no histórico. */
export async function deleteProposal(actor: Actor, id: string, meta: RequestMeta = NO_META): Promise<void> {
  await authorize(actor, "PROPOSALS", "DELETE");
  await getDb().transaction(async (tx) => {
    const before = await lockProposal(tx, id);
    if (before.status !== "RASCUNHO") throw new BusinessError("Só é possível excluir propostas em rascunho.", "CONFLICT");
    const [{ n }] = await tx.select({ n: count() }).from(contracts).where(eq(contracts.proposalId, id));
    if (n > 0) throw new BusinessError("Proposta vinculada a contrato não pode ser excluída.", "CONFLICT");
    await tx.delete(proposals).where(eq(proposals.id, id));
    await recordAudit(tx, { userId: actor.id, action: "PROPOSTA_EXCLUIDA", entity: "proposals", entityId: id, before, meta });
  });
}

/** Propostas aceitas ainda sem contrato, para o formulário de contrato. */
export async function listAcceptedWithoutContract() {
  const rows = await base().where(eq(proposals.status, "ACEITA")).orderBy(desc(proposals.createdAt));
  return rows.filter((r) => !r.contractId).map((r) => ({ id: r.id, number: r.number, title: r.title, clientId: r.clientId, clientName: r.clientName }));
}
