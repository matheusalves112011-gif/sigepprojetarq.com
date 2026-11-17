import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/session";
import { createClientAction } from "../actions";
import { ClientFields } from "../fields";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewClientPage() {
  await requirePermission("CLIENTS", "CREATE");
  return (
    <>
      <PageHeader title="Novo cliente" />
      <Card className="max-w-3xl">
        <ActionForm action={createClientAction} submitLabel="Salvar cliente" pendingLabel="Salvando…">
          <ClientFields />
        </ActionForm>
        <Link href="/clientes" className="mt-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-900">
          Cancelar
        </Link>
      </Card>
    </>
  );
}
