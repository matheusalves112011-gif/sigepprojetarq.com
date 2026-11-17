import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, TableCard, TD, TH } from "@/components/ui";
import { can } from "@/lib/rbac/can";
import { requirePermission } from "@/lib/session";
import { listDisciplines } from "@/modules/disciplines/service";
import { createDisciplineAction, deleteDisciplineAction, disciplineActiveAction } from "./actions";

export const metadata: Metadata = { title: "Disciplinas" };

export default async function DisciplinesPage() {
  const { user, grants } = await requirePermission("DISCIPLINES", "VIEW");
  const rows = await listDisciplines(user);
  const allow = (a: "CREATE" | "EDIT" | "DELETE") => can(user.role, grants, "DISCIPLINES", a);

  return (
    <>
      <PageHeader
        title="Disciplinas"
        description="Cadastro das disciplinas técnicas. A inclusão em cada projeto, com responsável técnico e ART/RRT, é feita na aba Disciplinas do projeto."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TableCard
            minWidth={520}
            head={
              <tr>
                <th className={TH}>Disciplina</th>
                <th className={TH}>Situação</th>
                <th className={`${TH} text-right`}>Projetos</th>
                <th className={TH} />
              </tr>
            }
          >
            {rows.map((d) => (
              <tr key={d.id}>
                <td className={`${TD} font-medium text-slate-900`}>{d.name}</td>
                <td className={TD}>{d.active ? <Badge kind="success">Ativa</Badge> : <Badge>Desativada</Badge>}</td>
                <td className={`${TD} text-right text-slate-600`}>{d.projects}</td>
                <td className={TD}>
                  <div className="flex justify-end gap-2">
                    {allow("EDIT") ? (
                      <ActionForm action={disciplineActiveAction.bind(null, d.id, !d.active)} submitLabel={d.active ? "Desativar" : "Ativar"} variant="secondary" className="space-y-1" />
                    ) : null}
                    {allow("DELETE") && d.projects === 0 ? (
                      <ActionForm action={deleteDisciplineAction.bind(null, d.id)} submitLabel="Excluir" variant="danger" className="space-y-1" confirm={`Excluir a disciplina ${d.name}?`} />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </TableCard>
        </div>
        {allow("CREATE") ? (
          <Card title="Nova disciplina">
            <ActionForm action={createDisciplineAction} submitLabel="Criar disciplina" resetOnSuccess>
              <Field label="Nome" htmlFor="name">
                <Input id="name" name="name" required maxLength={80} />
              </Field>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
