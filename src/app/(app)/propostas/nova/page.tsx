import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/session";
import { listServiceTypes } from "@/modules/catalog/service";
import { listClientOptions } from "@/modules/clients/service";
import { createProposalAction } from "../actions";
import { ProposalFields } from "../fields";

export const metadata: Metadata = { title: "Nova proposta" };

export default async function NewProposalPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await requirePermission("PROPOSALS", "CREATE");
  const [clients, serviceTypes, sp] = await Promise.all([listClientOptions(), listServiceTypes(), searchParams]);
  return (
    <>
      <PageHeader title="Nova proposta" description="A proposta nasce como rascunho e recebe número automático." />
      <Card className="max-w-3xl">
        <ActionForm action={createProposalAction} submitLabel="Salvar rascunho" pendingLabel="Salvando…">
          <ProposalFields clients={clients} serviceTypes={serviceTypes} clientId={sp.cliente} />
        </ActionForm>
        <Link href="/propostas" className="mt-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-900">
          Cancelar
        </Link>
      </Card>
    </>
  );
}
