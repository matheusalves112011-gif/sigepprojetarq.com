import { and, asc, count, eq, ilike, isNotNull, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { type DbOrTx, getDb } from "@/db";
import { type Client, clients, contracts, projects, proposals } from "@/db/schema";
import { isValidCNPJ, isValidCPF, normalizeDocument } from "@/lib/documents";
import { BusinessError, NO_META, type RequestMeta } from "@/lib/errors";
import { type Actor, authorize } from "@/lib/rbac/guard";
import { blankToNull, isUuid, likePattern, optText, parse, reqText } from "@/lib/validation";
import { recordAudit } from "@/modules/audit/service";

export const clientSchema = z
  .object({
    type: z.enum(["PF", "PJ"], { error: "Selecione o tipo de pessoa" }),
    name: reqText(3, 160, "o nome ou razão social"),
    document: z.preprocess(blankToNull, z.string().max(30).transform(normalizeDocument).nullable()),
    email: z.preprocess(blankToNull, z.email("E-mail inválido").max(254).nullable()),
    phone: optText(30),
    contactName: optText(120),
    address: optText(240),
    city: optText(80),
    state: z.preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/, "UF inválida (use a sigla, ex.: MT)")
        .nullable(),
    ),
    notes: optText(2000),
  })
  .superRefine((d, ctx) => {
    if (!d.document) return;
    if (d.type === "PF" && !isValidCPF(d.document)) ctx.addIssue({ code: "custom", message: "CPF inválido", path: ["document"] });
    if (d.type === "PJ" && !isValidCNPJ(d.document)) ctx.addIssue({ code: "custom", message: "CNPJ inválido", path: ["document"] });
  });

async function assertDocumentFree(tx: DbOrTx, document: string | null, exceptId: string | null): Promise<void> {
  if (!document) return;
  const [other] = await tx
    .select({ id: clients.id, deletedAt: clients.deletedAt })
    .from(clients)
    .where(exceptId ? and(eq(clients.document, document), ne(clients.id, exceptId)) : eq(clients.document, document));
  if (!other) return;
  throw new BusinessError(
    other.deletedAt
      ? "Já existe um cliente excluído com este CPF/CNPJ. Peça ao administrador para restaurá-lo."
      : "Já existe um cliente com este CPF/CNPJ.",
    "CONFLICT",
  );
}

export async function listClients(actor: Actor, opts: { q?: string; deleted?: boolean } = {}) {
  await authorize(actor, "CLIENTS", "VIEW");
  const deleted = Boolean(opts.deleted) && actor.role === "ADMIN_PRINCIPAL";
  const q = opts.q?.trim();
  const doc = q ? normalizeDocument(q) : "";
  const search = q ? or(ilike(clients.name, likePattern(q)), doc ? ilike(clients.document, likePattern(doc)) : undefined) : undefined;
  return getDb()
    .select()
    .from(clients)
    .where(and(deleted ? isNotNull(clients.deletedAt) : isNull(clients.deletedAt), search))
    .orderBy(asc(clients.name))
    .limit(300);
}

/** Clientes ativos para campos de seleção. */
export async function listClientOptions() {
  return getDb().select({ id: clients.id, name: clients.name }).from(clients).where(isNull(clients.deletedAt)).orderBy(asc(clients.name));
}

export async function getClient(actor: Actor, id: string): Promise<Client | null> {
  await authorize(actor, "CLIENTS", "VIEW");
  if (!isUuid(id)) return null;
  const [row] = await getDb().select().from(clients).where(eq(clients.id, id));
  if (!row || (row.deletedAt && actor.role !== "ADMIN_PRINCIPAL")) return null;
  return row;
}

export async function createClient(actor: Actor, input: unknown, meta: RequestMeta = NO_META): Promise<Client> {
  await authorize(actor, "CLIENTS", "CREATE");
  const data = parse(clientSchema, input);
  return getDb().transaction(async (tx) => {
    await assertDocumentFree(tx, data.document, null);
    const [row] = await tx
      .insert(clients)
      .values({ ...data, createdById: actor.id })
      .returning();
    await recordAudit(tx, { userId: actor.id, action: "CLIENTE_CRIADO", entity: "clients", entityId: row.id, after: row, meta });
    return row;
  });
}

async function lockClient(tx: DbOrTx, id: string): Promise<Client> {
  if (!isUuid(id)) throw new BusinessError("Cliente não encontrado.", "NOT_FOUND");
  const [row] = await tx.select().from(clients).where(eq(clients.id, id)).for("update");
  if (!row) throw new BusinessError("Cliente não encontrado.", "NOT_FOUND");
  return row;
}

export async function updateClient(actor: Actor, id: string, input: unknown, meta: RequestMeta = NO_META): Promise<Client> {
  await authorize(actor, "CLIENTS", "EDIT");
  const data = parse(clientSchema, input);
  return getDb().transaction(async (tx) => {
    const before = await lockClient(tx, id);
    if (before.deletedAt) throw new BusinessError("Cliente excluído não pode ser alterado. Restaure-o antes.", "CONFLICT");
    await assertDocumentFree(tx, data.document, id);
    const [row] = await tx
      .update(clients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    await recordAudit(tx, { userId: actor.id, action: "CLIENTE_ALTERADO", entity: "clients", entityId: id, before, after: row, meta });
    return row;
  });
}

/** Exclusão lógica. Cliente com propostas, contratos ou projetos não pode ser excluído. */
export async function deleteClient(actor: Actor, id: string, meta: RequestMeta = NO_META): Promise<void> {
  await authorize(actor, "CLIENTS", "DELETE");
  await getDb().transaction(async (tx) => {
    const before = await lockClient(tx, id);
    if (before.deletedAt) return;
    const [[p], [c], [j]] = await Promise.all([
      tx.select({ n: count() }).from(proposals).where(eq(proposals.clientId, id)),
      tx.select({ n: count() }).from(contracts).where(eq(contracts.clientId, id)),
      tx.select({ n: count() }).from(projects).where(eq(projects.clientId, id)),
    ]);
    if (p.n + c.n + j.n > 0) {
      throw new BusinessError("Este cliente possui propostas, contratos ou projetos e não pode ser excluído.", "CONFLICT");
    }
    await tx.update(clients).set({ deletedAt: new Date() }).where(eq(clients.id, id));
    await recordAudit(tx, { userId: actor.id, action: "CLIENTE_EXCLUIDO", entity: "clients", entityId: id, before, meta });
  });
}

/** Restauração administrativa de cliente excluído. */
export async function restoreClient(actor: Actor, id: string, meta: RequestMeta = NO_META): Promise<void> {
  if (actor.role !== "ADMIN_PRINCIPAL") throw new BusinessError("Somente o administrador principal restaura registros.", "FORBIDDEN");
  await getDb().transaction(async (tx) => {
    const before = await lockClient(tx, id);
    if (!before.deletedAt) return;
    await tx.update(clients).set({ deletedAt: null, updatedAt: new Date() }).where(eq(clients.id, id));
    await recordAudit(tx, { userId: actor.id, action: "CLIENTE_RESTAURADO", entity: "clients", entityId: id, meta });
  });
}

/** Garante que o cliente existe e não está excluído (usado por propostas, contratos e projetos). */
export async function assertActiveClient(tx: DbOrTx, id: string): Promise<void> {
  const [row] = await tx.select({ deletedAt: clients.deletedAt }).from(clients).where(eq(clients.id, id));
  if (!row || row.deletedAt) throw new BusinessError("Cliente não encontrado ou excluído.", "INVALID");
}
