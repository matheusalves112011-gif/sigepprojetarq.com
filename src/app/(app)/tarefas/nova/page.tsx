import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Alert, buttonClass, Card, Field, PageHeader, Select } from "@/components/ui";
import { requirePermission } from "@/lib/session";
import { getProject, listAssignableUsers, listProjectOptions } from "@/modules/projects/service";
import { listStages } from "@/modules/workflow/service";
import { createTaskAction } from "../actions";
import { TaskFields } from "../fields";

export const metadata: Metadata = { title: "Nova tarefa" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const { user } = await requirePermission("TASKS", "CREATE");
  const sp = await searchParams;
  const options = await listProjectOptions(user);
  const selected = sp.projeto && options.some((o) => o.id === sp.projeto) ? await getProject(user, sp.projeto) : null;

  // Etapas e responsáveis dependem do projeto: primeiro escolhe-se o projeto, depois preenche-se a tarefa.
  if (!selected) {
    return (
      <>
        <PageHeader title="Nova tarefa" description="Escolha o projeto da tarefa." />
        <Card className="max-w-xl">
          {options.length === 0 ? (
            <Alert kind="info">Você não tem projetos em andamento para receber tarefas.</Alert>
          ) : (
            <form action="/tarefas/nova" className="space-y-4">
              <Field label="Projeto" htmlFor="projeto">
                <Select id="projeto" name="projeto" required defaultValue="">
                  <option value="">Selecione…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} · {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <button type="submit" className={buttonClass("primary")}>
                Continuar
              </button>
            </form>
          )}
        </Card>
      </>
    );
  }

  const p = selected.project;
  const [stages, users] = await Promise.all([listStages(user, p.id), listAssignableUsers(user, p.id)]);
  return (
    <>
      <PageHeader title="Nova tarefa" description={`Projeto ${p.code} · ${p.name}`} />
      <Card className="max-w-3xl">
        <ActionForm action={createTaskAction} submitLabel="Criar tarefa" pendingLabel="Criando…">
          <input type="hidden" name="projectId" value={p.id} />
          <TaskFields stages={stages} users={users} currentStageId={p.currentStageId} />
        </ActionForm>
        <Link href={`/projetos/${p.id}?aba=tarefas`} className="mt-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-900">
          Cancelar
        </Link>
      </Card>
    </>
  );
}
