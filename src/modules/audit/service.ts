import { and, count, desc, eq, gte, ilike } from "drizzle-orm";
import { type DbOrTx, getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import type { RequestMeta } from "@/lib/errors";

export type AuditEntry = {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: RequestMeta;
};

/** Grava um registro de auditoria. Passe a transação em curso para que alteração e registro sejam atômicos. */
export async function recordAudit(dbOrTx: DbOrTx, entry: AuditEntry): Promise<void> {
  await dbOrTx.insert(auditLogs).values({
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.meta?.ip ?? null,
    userAgent: entry.meta?.userAgent?.slice(0, 300) ?? null,
  });
}

export const AUDIT_PAGE_SIZE = 25;

export async function listAudit(opts: { page?: number; action?: string } = {}) {
  const db = getDb();
  const page = Math.max(1, opts.page ?? 1);
  const where = opts.action ? ilike(auditLogs.action, `%${opts.action.replace(/[%_]/g, "")}%`) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        createdAt: auditLogs.createdAt,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        before: auditLogs.before,
        after: auditLogs.after,
        ip: auditLogs.ip,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

export async function countAuditLastHours(hours: number, action?: string): Promise<number> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(auditLogs)
    .where(action ? and(gte(auditLogs.createdAt, since), eq(auditLogs.action, action)) : gte(auditLogs.createdAt, since));
  return n;
}
