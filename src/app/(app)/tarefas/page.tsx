import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, EmptyRow, FilterBar, PageHeader, Select, TableCard, TD, TH } from "@/components/ui";
import { formatISODate } from "@/lib/format";
import { TASK_PRIORITY, TASK_STATUS } from "@/lib/labels";
import { can } from "@/lib/rbac/can";
import { requirePermission } from "@/lib/session";
import { listTasks } from "@/modules/tasks/service";

export const metadata: Metadata = { title: "Tarefas" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ escopo?: string; situacao?: string; aviso?: string }> }) {
  const { user, grants } = await requirePermission("TASKS", "VIEW");
  const sp = await searchParams;
  const status = sp.situacao ?? "ABERTAS";
  const rows = await listTasks(user, { mine: sp.escopo === "minhas", status: status === "ATRASADAS" ? "ABERTAS" : status, late: status === "ATRASADAS" });

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Tarefas dos projetos a que você tem acesso."
        actions={
          can(user.role, grants, "TASKS", "CREATE") ? (
            <Link href="/tarefas/nova" className={buttonClass("primary")}>
              Nova tarefa
            </Link>
          ) : null
        }
      />
      {sp.aviso === "excluida" ? (
        <div className="mb-4">
          <Alert kind="success">Tarefa excluída.</Alert>
        </div>
      ) : null}
      <FilterBar action="/tarefas">
        <Select name="escopo" defaultValue={sp.escopo ?? "todas"} aria-label="Escopo" className="sm:w-56">
          <option value="todas">Todas as tarefas</option>
          <option value="minhas">Atribuídas a mim</option>
        </Select>
        <Select name="situacao" defaultValue={status} aria-label="Situação" className="sm:w-56">
          <option value="ABERTAS">Em aberto</option>
          <option value="ATRASADAS">Atrasadas</option>
          <option value="CONCLUIDA">Concluídas</option>
          <option value="CANCELADA">Canceladas</option>
          <option value="TODAS">Todas</option>
        </Select>
      </FilterBar>
      <TableCard
        minWidth={820}
        head={
          <tr>
            <th className={TH}>Tarefa</th>
            <th className={TH}>Projeto</th>
            <th className={TH}>Responsável</th>
            <th className={TH}>Prazo</th>
            <th className={TH}>Prioridade</th>
            <th className={TH}>Situação</th>
          </tr>
        }
      >
        {rows.length === 0 ? <EmptyRow cols={6}>Nenhuma tarefa encontrada.</EmptyRow> : null}
        {rows.map((t) => (
          <tr key={t.id}>
            <td className={TD}>
              <Link href={`/tarefas/${t.id}`} className="font-medium text-brand-700 hover:underline">
                {t.title}
              </Link>
              {t.stageName ? <span className="block text-xs text-slate-500">Etapa: {t.stageName}</span> : null}
            </td>
            <td className={TD}>
              <Link href={`/projetos/${t.projectId}?aba=tarefas`} className="text-slate-700 hover:underline">
                {t.projectCode}
              </Link>
              <span className="block text-xs text-slate-500">{t.projectName}</span>
            </td>
            <td className={`${TD} text-slate-600`}>{t.assigneeName ?? "—"}</td>
            <td className={`${TD} whitespace-nowrap text-slate-600`}>
              {formatISODate(t.dueDate)}
              {t.late ? (
                <span className="ml-2">
                  <Badge kind="danger">Atrasada</Badge>
                </span>
              ) : null}
            </td>
            <td className={TD}>
              <Badge kind={TASK_PRIORITY[t.priority].kind}>{TASK_PRIORITY[t.priority].label}</Badge>
            </td>
            <td className={TD}>
              <Badge kind={TASK_STATUS[t.status].kind}>{TASK_STATUS[t.status].label}</Badge>
            </td>
          </tr>
        ))}
      </TableCard>
    </>
  );
}
