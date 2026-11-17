import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { contracts, projectStages, projects, tasks } from "@/db/schema";
import { addDays, todayISO } from "@/lib/format";
import { can } from "@/lib/rbac/can";
import type { Actor } from "@/lib/rbac/guard";
import { projectAccessFilter } from "@/modules/projects/service";

/**
 * Indicadores do painel, calculados no banco e limitados aos projetos a que o usuário tem acesso.
 * Cada bloco só é calculado se o perfil pode ver o módulo correspondente.
 */
export async function dashboardStats(actor: Actor, grants: ReadonlySet<string>) {
  const db = getDb();
  const today = todayISO();
  const weekEnd = addDays(today, 6);
  const access = projectAccessFilter(actor);
  const seeProjects = can(actor.role, grants, "PROJECTS", "VIEW");
  const seeTasks = can(actor.role, grants, "TASKS", "VIEW");
  const seeContracts = can(actor.role, grants, "CONTRACTS", "VIEW");
  const seeFinance = can(actor.role, grants, "FINANCE", "VIEW");

  const projectStats = seeProjects
    ? (
        await db
          .select({
            ativos: sql<number>`count(*) filter (where ${projects.status} = 'ATIVO')::int`,
            pausados: sql<number>`count(*) filter (where ${projects.status} = 'PAUSADO')::int`,
            concluidos: sql<number>`count(*) filter (where ${projects.status} = 'CONCLUIDO')::int`,
            atrasados: sql<number>`count(*) filter (where ${projects.status} = 'ATIVO' and (${projectStages.dueDate} < ${today} or ${projects.dueDate} < ${today}))::int`,
            aguardandoCliente: sql<number>`count(*) filter (where ${projects.status} = 'ATIVO' and ${projectStages.status} = 'AGUARDANDO_CLIENTE')::int`,
            aguardandoOrgao: sql<number>`count(*) filter (where ${projects.status} = 'ATIVO' and ${projectStages.status} = 'AGUARDANDO_ORGAO')::int`,
            etapasDaSemana: sql<number>`count(*) filter (where ${projects.status} = 'ATIVO' and ${projectStages.dueDate} between ${today} and ${weekEnd})::int`,
          })
          .from(projects)
          .leftJoin(projectStages, eq(projectStages.id, projects.currentStageId))
          .where(access)
      )[0]
    : null;

  const taskStats = seeTasks
    ? (
        await db
          .select({
            pendentes: sql<number>`count(*) filter (where ${tasks.status} in ('PENDENTE','EM_ANDAMENTO'))::int`,
            minhas: sql<number>`count(*) filter (where ${tasks.status} in ('PENDENTE','EM_ANDAMENTO') and ${tasks.assigneeId} = ${actor.id})::int`,
            atrasadas: sql<number>`count(*) filter (where ${tasks.status} in ('PENDENTE','EM_ANDAMENTO') and ${tasks.dueDate} < ${today})::int`,
            daSemana: sql<number>`count(*) filter (where ${tasks.status} in ('PENDENTE','EM_ANDAMENTO') and ${tasks.dueDate} between ${today} and ${weekEnd})::int`,
          })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(access)
      )[0]
    : null;

  const contractStats = seeContracts
    ? (
        await db
          .select({
            vigentes: sql<number>`count(*)::int`,
            valor: sql<string>`coalesce(sum(${contracts.value}), 0)::text`,
          })
          .from(contracts)
          .where(and(eq(contracts.status, "VIGENTE")))
      )[0]
    : null;

  return {
    projects: projectStats,
    tasks: taskStats,
    contracts: contractStats ? { vigentes: contractStats.vigentes, receitaContratada: seeFinance ? contractStats.valor : null } : null,
  };
}
