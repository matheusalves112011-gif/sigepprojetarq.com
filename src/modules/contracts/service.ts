import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { type DbOrTx, getDb } from "@/db";
import { clients, type Contract, type ContractStatus, contracts, projects, proposals } from "@/db/schema";
import { BusinessError, NO_META, type RequestMeta } from "@/lib/errors";
import { type Actor, authorize, canSeeValues } from "@/lib/rbac/guard";
import { nextNumber } from "@/lib/sequence";
import { isUuid, likePattern, money, optDate, optText, optUuid, parse, reqText, reqUuid } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";
import { assertActiveClient } from "@/modules/clients/service";

export const contractSchema = z
  .object({
    clientId: reqUuid("o cliente"),
    proposalId: optUuid,
    title: reqText(3, 200, "o objeto do contrato"),
    value: money,
    signedAt: optDate,
    startDate: optDate,
    endDate: optDate,
    notes: optText(5000),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, "O fim da vigência não pode ser anterior ao início.");

const TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  RASCUNHO: ["VIGENTE", "CANCELADO"],
  VIGENTE: ["ENCERRADO", "CANCELADO"],
  ENCERRADO: [],
  CANCELADO: [],
};
export const contractNextStatuses = (s: ContractStatus) => TRANSITIONS[s];

const base = () =>
  getDb()
    .select({
      id: contracts.id,
      number: contracts.number,
      title: contracts.title,
      value: contracts.value,
      signedAt: contracts.signedAt,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      status: contracts.status,
      notes: contracts.notes,
      createdAt: contracts.createdAt,
      clientId: contracts.clientId,
      clientName: clients.name,
      proposalId: contracts.proposalId,
      proposalNumber: proposals.number,
    })
    .from(contracts)
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .leftJoin(proposals, eq(proposals.id, contracts.proposalId));

export async function listContracts(actor: Actor, opts: { q?: string; status?: string; clientId?: string } = {}) {
  const grants = await authorize(actor, "CONTRACTS", "VIEW");
  const showValues = canSeeValues(actor.role, grants, "CONTRACTS");
  const q = opts.q?.trim();
  const status = (["RASCUNHO", "VIGENTE", "ENCERRADO", "CANCELADO"] as const).find((s) => s === opts.status);
  const rows = await base()
    .where(
      and(
        q ? or(ilike(contracts.title, likePattern(q)), ilike(contracts.number, likePattern(q)), ilike(clients.name, likePattern(q))) : undefined,
        status ? eq(contracts.status, status) : undefined,
        isUuid(opts.clientId) ? eq(contracts.clientId, opts.clientId) : undefined,
      ),
    )
    .orderBy(desc(contracts.createdAt))
    .limit(300);
  return rows.map((r) => ({ ...r, value: showValues ? r.value : null }));
}

export async function getContract(actor: Actor, id: string) {
  const grants = await authorize(actor, "CONTRACTS", "VIEW");
  if (!isUuid(id)) return null;
  const [row] = await base().where(eq(contracts.id, id));
  if (!row) return null;
  return { ...row, value: canSeeValues(actor.role, grants, "CONTRACTS") ? row.value : null };
}

/** Contratos que podem receber projetos (rascunho ou vigente), para campos de seleção. */
export async function listContractOptions() {
  return getDb()
    .select({ id: contracts.id, number: contracts.number, title: contracts.title, clientId: contracts.clientId, clientName: clients.name })
    .from(contracts)
    .innerJoin(clients, eq(clients.id, contracts.clientId))
    .where(inArray(contracts.status, ["RASCUNHO", "VIGENTE"]))
    .orderBy(desc(contracts.createdAt));
}

async function assertProposalUsable(tx: DbOrTx, proposalId: string | null, clientId: string, exceptContractId: string | null): Promise<void> {
  if (!proposalId) return;
  const [p] = await tx.select({ status: proposals.status, clientId: proposals.clientId }).from(proposals).where(eq(proposals.id, proposalId)).for("update");
  if (!p) throw new BusinessError("Proposta não encontrada.", "INVALID");
  if (p.status !== "ACEITA") throw new BusinessError("Só propostas aceitas podem originar contrato.", "CONFLICT");
  if (p.clientId !== clientId) throw new BusinessError("A proposta pertence a outro cliente.", "INVALID");
  const [other] = await tx.select({ id: contracts.id }).from(contracts).where(eq(contracts.proposalId, proposalId));
  if (other && other.id !== exceptContractId) throw new BusinessError("Esta proposta já originou outro contrato.", "CONFLICT");
}

export async function createContract(actor: Actor, input: unknown, meta: RequestMeta = NO_META): Promise<Contract> {
  await authorize(actor, "CONTRACTS", "CREATE");
  const data = parse(contractSchema, input);
  return getDb().transaction(async (tx) => {
    await assertActiveClient(tx, data.clientId);
    await assertProposalUsable(tx, data.proposalId, data.clientId, null);
    const number = await nextNumber(tx, "CT");
    const [row] = await tx
      .insert(contracts)
      .values({ ...data, number, createdById: actor.id })
      .returning();
    await recordAudit(tx, { userId: actor.id, action: "CONTRATO_CRIADO", entity: "contracts", entityId: row.id, after: row, meta });
    return row;
  });
}

async function lockContract(tx: DbOrTx, id: string): Promise<Contract> {
  if (!isUuid(id)) throw new BusinessError("Contrato não encontrado.", "NOT_FOUND");
  const [row] = await tx.select().from(contracts).where(eq(contracts.id, id)).for("update");
  if (!row) throw new BusinessError("Contrato não encontrado.", "NOT_FOUND");
  return row;
}

export async function updateContract(actor: Actor, id: string, input: unknown, meta: RequestMeta = NO_META): Promise<Contract> {
  await authorize(actor, "CONTRACTS", "EDIT");
  const data = parse(contractSchema, input);
  return getDb().transaction(async (tx) => {
    const before = await lockContract(tx, id);
    if (before.status !== "RASCUNHO") {
      throw new BusinessError("Só é possível alterar contratos em rascunho. Contrato vigente é alterado por aditivo (Fase 4).", "CONFLICT");
    }
    if (data.clientId !== before.clientId) {
      const [{ n }] = await tx.select({ n: count() }).from(projects).where(eq(projects.contractId, id));
      if (n > 0) throw new BusinessError("Contrato com projetos vinculados não pode mudar de cliente.", "CONFLICT");
    }
    await assertActiveClient(tx, data.clientId);
    await assertProposalUsable(tx, data.proposalId, data.clientId, id);
    const [row] = await tx
      .update(contracts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contracts.id, id))
      .returning();
    await recordAudit(tx, { userId: actor.id, action: "CONTRATO_ALTERADO", entity: "contracts", entityId: id, before, after: row, meta });
    return row;
  });
}

export async function setContractStatus(actor: Actor, id: string, to: string, meta: RequestMeta = NO_META): Promise<Contract> {
  await authorize(actor, "CONTRACTS", "EDIT");
  return getDb().transaction(async (tx) => {
    const before = await lockContract(tx, id);
    const target = TRANSITIONS[before.status].find((s) => s === to);
    if (!target) throw new BusinessError("Mudança de situação não permitida para este contrato.", "CONFLICT");
    if (target === "VIGENTE") {
      if (!before.signedAt || !before.startDate) {
        throw new BusinessError("Informe a data de assinatura e o início da vigência antes de tornar o contrato vigente.", "INVALID");
      }
      if (Number(before.value) <= 0) throw new BusinessError("Informe um valor maior que zero antes de tornar o contrato vigente.", "INVALID");
    }
    if (target === "CANCELADO" || target === "ENCERRADO") {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(projects)
        .where(and(eq(projects.contractId, id), inArray(projects.status, ["ATIVO", "PAUSADO"])));
      if (n > 0) {
        throw new BusinessError(`Há ${n} projeto(s) em andamento neste contrato. Conclua ou cancele os projetos antes.`, "CONFLICT");
      }
    }
    const [row] = await tx.update(contracts).set({ status: target, updatedAt: new Date() }).where(eq(contracts.id, id)).returning();
    await recordAudit(tx, {
      userId: actor.id,
      action: "CONTRATO_SITUACAO_ALTERADA",
      entity: "contracts",
      entityId: id,
      before: { status: before.status },
      after: { status: row.status },
      meta,
    });
    return row;
  });
}

export async function deleteContract(actor: Actor, id: string, meta: RequestMeta = NO_META): Promise<void> {
  await authorize(actor, "CONTRACTS", "DELETE");
  await getDb().transaction(async (tx) => {
    const before = await lockContract(tx, id);
    if (before.status !== "RASCUNHO") throw new BusinessError("Só é possível excluir contratos em rascunho.", "CONFLICT");
    const [{ n }] = await tx.select({ n: count() }).from(projects).where(eq(projects.contractId, id));
    if (n > 0) throw new BusinessError("Contrato com projetos vinculados não pode ser excluído.", "CONFLICT");
    await tx.delete(contracts).where(eq(contracts.id, id));
    await recordAudit(tx, { userId: actor.id, action: "CONTRATO_EXCLUIDO", entity: "contracts", entityId: id, before, meta });
  });
}
