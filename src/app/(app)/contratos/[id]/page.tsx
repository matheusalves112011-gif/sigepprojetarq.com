import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, buttonClass, Card, PageHeader, ReadOnly } from "@/components/ui";
import { CONTRACT_STATUS, PROJECT_STATUS } from "@/lib/labels";
import { can } from "@/lib/rbac/can";
import { requirePermission } from "@/lib/session";
import { listClientOptions } from "@/modules/clients/service";
import { contractNextStatuses, getContract } from "@/modules/contracts/service";
import { listProjects } from "@/modules/projects/service";
import { listAcceptedWithoutContract } from "@/modules/proposals/service";
import { contractStatusAction, deleteContractAction, updateContractAction } from "../actions";
import { ContractFields } from "../fields";

export const metadata: Metadata = { title: "Contrato" };

const ACTION_LABEL = { VIGENTE: "Tornar vigente", ENCERRADO: "Encerrar contrato", CANCELADO: "Cancelar contrato", RASCUNHO: "" } as const;
const ACTION_VARIANT = { VIGENTE: "success", ENCERRADO: "primary", CANCELADO: "danger", RASCUNHO: "secondary" } as const;

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { user, grants } = await requirePermission("CONTRACTS", "VIEW");
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const c = await getContract(user, id);
  if (!c) notFound();
  const canEdit = can(user.role, grants, "CONTRACTS", "EDIT");
  const editable = canEdit && c.status === "RASCUNHO";
  const seeProjects = can(user.role, grants, "PROJECTS", "VIEW");
  const [clients, free, projects] = await Promise.all([listClientOptions(), listAcceptedWithoutContract(), seeProjects ? listProjects(user, { contractId: id }) : null]);
  // A proposta já vinculada não aparece entre as "sem contrato"; é incluída para o campo continuar preenchido.
  const proposals =
    c.proposalId && c.proposalNumber ? [{ id: c.proposalId, number: c.proposalNumber, title: c.title, clientName: c.clientName }, ...free] : free;
  const fields = <ContractFields clients={clients} proposals={proposals} values={c} hideValue={c.value === null} />;

  return (
    <>
      <PageHeader title={`Contrato ${c.number}`} description={c.clientName} actions={<Badge kind={CONTRACT_STATUS[c.status].kind}>{CONTRACT_STATUS[c.status].label}</Badge>} />
      <Link href="/contratos" className="mb-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
        ← Voltar para contratos
      </Link>
      {aviso === "criado" ? (
        <div className="mb-4">
          <Alert kind="success">Contrato criado como rascunho.</Alert>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Dados do contrato" description={editable ? undefined : "Somente rascunhos podem ser alterados."} className="xl:col-span-2">
          {editable ? (
            <ActionForm action={updateContractAction.bind(null, id)} submitLabel="Salvar alterações">
              {fields}
            </ActionForm>
          ) : (
            <ReadOnly>{fields}</ReadOnly>
          )}
        </Card>
        <div className="space-y-6">
          {canEdit && contractNextStatuses(c.status).length > 0 ? (
            <Card title="Situação">
              <div className="space-y-3">
                {contractNextStatuses(c.status).map((to) => (
                  <ActionForm
                    key={to}
                    action={contractStatusAction.bind(null, id, to)}
                    submitLabel={ACTION_LABEL[to]}
                    variant={ACTION_VARIANT[to]}
                    confirm={to === "VIGENTE" ? undefined : `${ACTION_LABEL[to]}? Esta mudança não pode ser desfeita.`}
                    fullWidthButton
                  />
                ))}
              </div>
            </Card>
          ) : null}
          {projects ? (
            <Card title="Projetos deste contrato">
              {projects.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum projeto a que você tenha acesso.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {projects.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                      <Link href={`/projetos/${p.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        {p.code} · {p.name}
                      </Link>
                      <Badge kind={PROJECT_STATUS[p.status].kind}>{PROJECT_STATUS[p.status].label}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              {can(user.role, grants, "PROJECTS", "CREATE") && (c.status === "RASCUNHO" || c.status === "VIGENTE") ? (
                <Link href={`/projetos/novo?contrato=${id}`} className={buttonClass("secondary", "mt-4 w-full")}>
                  Novo projeto neste contrato
                </Link>
              ) : null}
            </Card>
          ) : null}
          {can(user.role, grants, "CONTRACTS", "DELETE") && c.status === "RASCUNHO" ? (
            <Card title="Excluir rascunho">
              <ActionForm action={deleteContractAction.bind(null, id)} submitLabel="Excluir contrato" variant="danger" confirm={`Excluir o contrato ${c.number}?`} />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
