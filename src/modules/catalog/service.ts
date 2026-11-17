import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { serviceTypes, users } from "@/db/schema";

export async function listServiceTypes() {
  return getDb().select({ id: serviceTypes.id, name: serviceTypes.name }).from(serviceTypes).where(eq(serviceTypes.active, true)).orderBy(asc(serviceTypes.name));
}

/** Usuários ativos, para campos de responsável. */
export async function listActiveUsers() {
  return getDb().select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.status, "ATIVO")).orderBy(asc(users.name));
}
