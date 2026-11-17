import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, buttonClass, Card, PageHeader, ReadOnly } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { PROPOSAL_STATUS } from "@/lib/labels";
import { can } from "@/lib/rbac/can";
import { requirePermission } from "@/lib/session";
import { listServiceTypes } from "@/modules/catalog/service";
import { listClientOptions } from "@/modules/clients/service";
import { getProposal, proposalNextStatuses } from "@/modules/proposals/service";
import { deleteProposalAction, proposalStatusAction, updateProposalAction } from "../actions";
import { ProposalFields } from "../fields";

export const metadata: Metadata = { title: "Proposta" };

const ACTION_LABEL = { ENVIADA: "Marcar como enviada", ACEITA: "Registrar aceite do cliente", RECUSADA: "Registrar recusa", RASCUNHO: "Voltar para rascunho" } as const;
const ACTION_VARIANT = { ENVIADA: "primary", ACEITA: "success", RECUSADA: "danger", RASCUNHO: "secondary" } as const;

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { user, grants } = await requirePermission("PROPOSALS", "VIEW");
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const p = await getProposal(user, id);
  if (!p) notFound();
  const canEdit = can(user.role, grants, "PROPOSALS", "EDIT");
  const editable = canEdit && p.status === "RASCUNHO";
  const [clients, serviceTypes] = await Promise.all([listClientOptions(), listServiceTypes()]);
  const fields = <ProposalFields clients={clients} serviceTypes={serviceTypes} values={p} />;

  return (
    <>
      <PageHeader
        title={`Proposta ${p.number}`}
        description={`${p.clientName} · ${p.serviceTypeName} · criada em ${formatDateTime(p.createdAt)}`}
        actions={
          <>
            <Badge kind={PROPOSAL_STATUS[p.status].kind}>{PROPOSAL_STATUS[p.status].label}</Badge>
            {p.expired ? <Badge kind="danger">Vencida</Badge> : null}
          </>
        }
      />
      <Link href="/propostas" className="mb-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
        ← Voltar para propostas
      </Link>
      {aviso === "criada" ? (
        <div className="mb-4">
          <Alert kind="success">Proposta criada como rascunho.</Alert>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Dados da proposta" description={editable ? undefined : "Somente rascunhos podem ser alterados."} className="xl:col-span-2">
          {editable ? (
            <ActionForm action={updateProposalAction.bind(null, id)} submitLabel="Salvar alterações">
              {fields}
            </ActionForm>
          ) : (
            <ReadOnly>{fields}</ReadOnly>
          )}
        </Card>
        <div className="space-y-6">
          {canEdit && proposalNextStatuses(p.status).length > 0 ? (
            <Card title="Situação">
              <div className="space-y-3">
                {proposalNextStatuses(p.status).map((to) => (
                  <ActionForm key={to} action={proposalStatusAction.bind(null, id, to)} submitLabel={ACTION_LABEL[to]} variant={ACTION_VARIANT[to]} fullWidthButton />
                ))}
              </div>
            </Card>
          ) : null}
          {p.status === "ACEITA" ? (
            <Card title="Contrato">
              {p.contractId ? (
                <Link href={`/contratos/${p.contractId}`} className="text-sm font-medium text-brand-700 hover:underline">
                  Contrato {p.contractNumber}
                </Link>
              ) : can(user.role, grants, "CONTRACTS", "CREATE") ? (
                <Link href={`/contratos/novo?proposta=${id}`} className={buttonClass("primary", "w-full")}>
                  Gerar contrato desta proposta
                </Link>
              ) : (
                <p className="text-sm text-slate-500">Ainda não há contrato para esta proposta.</p>
              )}
            </Card>
          ) : null}
          {can(user.role, grants, "PROPOSALS", "DELETE") && p.status === "RASCUNHO" ? (
            <Card title="Excluir rascunho">
              <ActionForm action={deleteProposalAction.bind(null, id)} submitLabel="Excluir proposta" variant="danger" confirm={`Excluir a proposta ${p.number}?`} />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
