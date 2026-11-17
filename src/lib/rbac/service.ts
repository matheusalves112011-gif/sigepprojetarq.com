import { eq } from "drizzle-orm";
import { type DbOrTx, getDb } from "@/db";
import { type Role, rolePermissions } from "@/db/schema";
import { BusinessError, NO_META, type RequestMeta } from "@/lib/errors";
import { recordAudit } from "@/modules/audit/service";
import { DEFAULT_GRANTS, normalizeGrants, validateGrants } from "./can";
import { type Grant, GRANTABLE_ROLES, type GrantableRole, grantKey } from "./modules";

export async function getRoleGrantList(role: Role, dbOrTx: DbOrTx = getDb()): Promise<Grant[]> {
  if (role === "ADMIN_PRINCIPAL") return [];
  const rows = await dbOrTx
    .select({ module: rolePermissions.module, action: rolePermissions.action })
    .from(rolePermissions)
    .where(eq(rolePermissions.role, role));
  return normalizeGrants(rows);
}

export async function getRoleGrants(role: Role, dbOrTx: DbOrTx = getDb()): Promise<Set<string>> {
  const list = await getRoleGrantList(role, dbOrTx);
  return new Set(list.map((g) => grantKey(g.module, g.action)));
}

/** Grava a matriz inicial. Usada uma única vez, na instalação. */
export async function seedDefaultPermissions(tx: DbOrTx, actorId: string): Promise<void> {
  for (const role of GRANTABLE_ROLES) {
    const values = DEFAULT_GRANTS[role].map((g) => ({ role, module: g.module, action: g.action, updatedById: actorId }));
    if (values.length) await tx.insert(rolePermissions).values(values).onConflictDoNothing();
  }
}

type Actor = { id: string; role: Role };

/** Substitui as permissões de um perfil. Somente o administrador principal; registra antes e depois. */
export async function updateRolePermissions(
  actor: Actor,
  role: string,
  grants: Grant[],
  meta: RequestMeta = NO_META,
): Promise<Grant[]> {
  if (actor.role !== "ADMIN_PRINCIPAL") {
    throw new BusinessError("Somente o administrador principal altera permissões.", "FORBIDDEN");
  }
  const problems = validateGrants(role, grants);
  if (problems.length) throw new BusinessError(problems.join(" "), "INVALID");
  const target = role as GrantableRole;
  const next = normalizeGrants(grants);

  return getDb().transaction(async (tx) => {
    const before = await getRoleGrantList(target, tx);
    await tx.delete(rolePermissions).where(eq(rolePermissions.role, target));
    if (next.length) {
      await tx
        .insert(rolePermissions)
        .values(next.map((g) => ({ role: target, module: g.module, action: g.action, updatedById: actor.id })));
    }
    await recordAudit(tx, {
      userId: actor.id,
      action: "PERMISSOES_ALTERADAS",
      entity: "role_permissions",
      entityId: target,
      before: before.map((g) => grantKey(g.module, g.action)),
      after: next.map((g) => grantKey(g.module, g.action)),
      meta,
    });
    return next;
  });
}
