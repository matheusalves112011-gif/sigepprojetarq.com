import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/session";
import { listClientOptions } from "@/modules/clients/service";
import { getProposal, listAcceptedWithoutContract } from "@/modules/proposals/service";
import { createContractAction } from "../actions";
import { ContractFields } from "../fields";

export const metadata: Metadata = { title: "Novo contrato" };

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ proposta?: string }> }) {
  const { user } = await requirePermission("CONTRACTS", "CREATE");
  const [clients, proposals, sp] = await Promise.all([listClientOptions(), listAcceptedWithoutContract(), searchParams]);
  // Vindo de uma proposta aceita, o formulário já abre preenchido com os dados dela.
  const origin = sp.proposta && proposals.some((p) => p.id === sp.proposta) ? await getProposal(user, sp.proposta) : null;
  const values = origin ? { clientId: origin.clientId, proposalId: origin.id, title: origin.title, value: origin.value } : undefined;
  return (
    <>
      <PageHeader title="Novo contrato" description="O contrato nasce como rascunho. Para ficar vigente precisa de assinatura, início da vigência e valor." />
      <Card className="max-w-4xl">
        <ActionForm action={createContractAction} submitLabel="Salvar rascunho" pendingLabel="Salvando…">
          <ContractFields clients={clients} proposals={proposals} values={values} />
        </ActionForm>
        <Link href="/contratos" className="mt-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-900">
          Cancelar
        </Link>
      </Card>
    </>
  );
}
