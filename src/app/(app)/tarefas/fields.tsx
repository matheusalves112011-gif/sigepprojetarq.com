import { Field, Input, Select, Textarea } from "@/components/ui";
import { TASK_PRIORITY } from "@/lib/labels";

type Values = { stageId: string | null; title: string; description: string | null; assigneeId: string | null; dueDate: string | null; priority: string };

export function TaskFields({
  stages,
  users,
  values,
  currentStageId,
}: {
  stages: { id: string; position: number; name: string; status: string }[];
  users: { id: string; name: string }[];
  values?: Values;
  currentStageId?: string | null;
}) {
  return (
    <>
      <Field label="Título" htmlFor="title">
        <Input id="title" name="title" defaultValue={values?.title} required maxLength={200} />
      </Field>
      <Field label="Descrição" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={values?.description ?? ""} maxLength={5000} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Etapa" htmlFor="stageId" hint="Tarefas em aberto impedem a tramitação da etapa a que pertencem.">
          <Select id="stageId" name="stageId" defaultValue={values ? (values.stageId ?? "") : (currentStageId ?? "")}>
            <option value="">Sem etapa</option>
            {stages
              .filter((s) => s.status !== "CANCELADA")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.position}. {s.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Responsável" htmlFor="assigneeId" hint="Só quem tem acesso ao projeto.">
          <Select id="assigneeId" name="assigneeId" defaultValue={values?.assigneeId ?? ""}>
            <option value="">Sem responsável</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Prazo" htmlFor="dueDate">
          <Input id="dueDate" name="dueDate" type="date" defaultValue={values?.dueDate ?? ""} />
        </Field>
        <Field label="Prioridade" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={values?.priority ?? "MEDIA"}>
            {Object.entries(TASK_PRIORITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </>
  );
}
