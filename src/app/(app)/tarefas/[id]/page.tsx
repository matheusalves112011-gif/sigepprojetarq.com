import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, PageHeader, ReadOnly } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { TASK_PRIORITY, TASK_STATUS } from "@/lib/labels";
import { can } from "@/lib/rbac/can";
import { requirePermission } from "@/lib/session";
import { listAssignableUsers } from "@/modules/projects/service";
import { getTask } from "@/modules/tasks/service";
import { listStages } from "@/modules/workflow/service";
import { deleteTaskAction, taskStatusAction, updateTaskAction } from "../actions";
import { TaskFields } from "../fields";

export const metadata: Metadata = { title: "Tarefa" };

const NEXT = {
  PENDENTE: [
    ["EM_ANDAMENTO", "Iniciar tarefa", "primary"],
    ["CONCLUIDA", "Concluir tarefa", "success"],
    ["CANCELADA", "Cancelar tarefa", "danger"],
  ],
  EM_ANDAMENTO: [
    ["CONCLUIDA", "Concluir tarefa", "success"],
    ["PENDENTE", "Voltar para pendente", "secondary"],
    ["CANCELADA", "Cancelar tarefa", "danger"],
  ],
  CONCLUIDA: [["EM_ANDAMENTO", "Reabrir tarefa", "secondary"]],
  CANCELADA: [["PENDENTE", "Reabrir tarefa", "secondary"]],
} as const;

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { user, grants } = await requirePermission("TASKS", "VIEW");
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const t = await getTask(user, id);
  if (!t) notFound();
  const projectOpen = t.projectStatus === "ATIVO" || t.projectStatus === "PAUSADO";
  const canEdit = can(user.role, grants, "TASKS", "EDIT") && projectOpen;
  const [stages, users] = await Promise.all([listStages(user, t.projectId), listAssignableUsers(user, t.projectId)]);
  const fields = <TaskFields stages={stages} users={users} values={t} />;

  return (
    <>
      <PageHeader
        title={t.title}
        description={`Projeto ${t.projectCode} · ${t.projectName} · criada em ${formatDateTime(t.createdAt)}`}
        actions={
          <>
            {t.late ? <Badge kind="danger">Atrasada</Badge> : null}
            <Badge kind={TASK_PRIORITY[t.priority].kind}>{TASK_PRIORITY[t.priority].label}</Badge>
            <Badge kind={TASK_STATUS[t.status].kind}>{TASK_STATUS[t.status].label}</Badge>
          </>
        }
      />
      <div className="mb-6 flex gap-6 text-sm font-medium">
        <Link href="/tarefas" className="text-brand-600 hover:text-brand-700">
          ← Tarefas
        </Link>
        <Link href={`/projetos/${t.projectId}?aba=tarefas`} className="text-brand-600 hover:text-brand-700">
          Ir para o projeto
        </Link>
      </div>
      {aviso === "criada" ? (
        <div className="mb-4">
          <Alert kind="success">Tarefa criada.</Alert>
        </div>
      ) : null}
      {!projectOpen ? (
        <div className="mb-4">
          <Alert kind="info">O projeto está concluído ou cancelado; a tarefa não pode mais ser alterada.</Alert>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Dados da tarefa" className="xl:col-span-2">
          {canEdit ? (
            <ActionForm action={updateTaskAction.bind(null, id)} submitLabel="Salvar alterações">
              {fields}
            </ActionForm>
          ) : (
            <ReadOnly>{fields}</ReadOnly>
          )}
        </Card>
        <div className="space-y-6">
          {canEdit ? (
            <Card title="Situação">
              <div className="space-y-3">
                {NEXT[t.status].map(([to, label, variant]) => (
                  <ActionForm key={to} action={taskStatusAction.bind(null, id, to)} submitLabel={label} variant={variant} fullWidthButton />
                ))}
              </div>
            </Card>
          ) : null}
          {can(user.role, grants, "TASKS", "DELETE") ? (
            <Card title="Excluir tarefa">
              <ActionForm action={deleteTaskAction.bind(null, id)} submitLabel="Excluir tarefa" variant="danger" confirm="Excluir esta tarefa?" />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
