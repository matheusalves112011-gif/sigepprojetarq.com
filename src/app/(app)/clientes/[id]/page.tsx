import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, PageHeader, ReadOnly } from "@/components/ui";
import { CONTRACT_STATUS, PROJECT_STATUS, PROPOSAL_STATUS } from "@/lib/labels";
import { can } from "@/lib/rbac/can";
import { requirePermission } from "@/lib/session";
import { getClient } from "@/modules/clients/service";
import { listContracts } from "@/modules/contracts/service";
import { listProjects } from "@/modules/projects/service";
import { listProposals } from "@/modules/proposals/service";
import { deleteClientAction, restoreClientAction, updateClientAction } from "../actions";
import { ClientFields } from "../fields";

export const metadata: Metadata = { title: "Cliente" };

function Linked({ title, items, empty }: { title: string; empty: string; items: { href: string; label: string; badge: { label: string; kind: "neutral" | "brand" | "success" | "danger" | "warning" } }[] }) {
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((i) => (
            <li key={i.href} className="flex items-center justify-between gap-3 py-2">
              <Link href={i.href} className="text-sm font-medium text-brand-700 hover:underline">
                {i.label}
              </Link>
              <Badge kind={i.badge.kind}>{i.badge.label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { user, grants } = await requirePermission("CLIENTS", "VIEW");
  const [{ id }, { aviso }] = await Promise.all([params, searchParams]);
  const client = await getClient(user, id);
  if (!client) notFound();
  const allow = (m: "CLIENTS" | "PROPOSALS" | "CONTRACTS" | "PROJECTS", a: "VIEW" | "EDIT" | "DELETE") => can(user.role, grants, m, a);
  const canEdit = allow("CLIENTS", "EDIT") && !client.deletedAt;

  const [proposals, contracts, projects] = await Promise.all([
    allow("PROPOSALS", "VIEW") ? listProposals(user, { clientId: id }) : null,
    allow("CONTRACTS", "VIEW") ? listContracts(user, { clientId: id }) : null,
    allow("PROJECTS", "VIEW") ? listProjects(user, { clientId: id }) : null,
  ]);

  return (
    <>
      <PageHeader title={client.name} description={client.type === "PJ" ? "Pessoa jurídica" : "Pessoa física"} />
      <Link href="/clientes" className="mb-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
        ← Voltar para clientes
      </Link>
      {aviso === "criado" || aviso === "restaurado" ? (
        <div className="mb-4">
          <Alert kind="success">{aviso === "criado" ? "Cliente cadastrado." : "Cliente restaurado."}</Alert>
        </div>
      ) : null}
      {client.deletedAt ? (
        <Card title="Cliente excluído" description="O cadastro está preservado e pode ser restaurado pelo administrador." className="mb-6">
          <ActionForm action={restoreClientAction.bind(null, id)} submitLabel="Restaurar cliente" variant="success" />
        </Card>
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Cadastro" className="xl:col-span-2">
          {canEdit ? (
            <ActionForm action={updateClientAction.bind(null, id)} submitLabel="Salvar alterações">
              <ClientFields client={client} />
            </ActionForm>
          ) : (
            <ReadOnly>
              <ClientFields client={client} />
            </ReadOnly>
          )}
        </Card>
        <div className="space-y-6">
          {proposals ? (
            <Linked
              title="Propostas"
              empty="Nenhuma proposta."
              items={proposals.map((p) => ({ href: `/propostas/${p.id}`, label: `${p.number} · ${p.title}`, badge: PROPOSAL_STATUS[p.status] }))}
            />
          ) : null}
          {contracts ? (
            <Linked
              title="Contratos"
              empty="Nenhum contrato."
              items={contracts.map((c) => ({ href: `/contratos/${c.id}`, label: `${c.number} · ${c.title}`, badge: CONTRACT_STATUS[c.status] }))}
            />
          ) : null}
          {projects ? (
            <Linked
              title="Projetos"
              empty="Nenhum projeto a que você tenha acesso."
              items={projects.map((p) => ({ href: `/projetos/${p.id}`, label: `${p.code} · ${p.name}`, badge: PROJECT_STATUS[p.status] }))}
            />
          ) : null}
          {allow("CLIENTS", "DELETE") && !client.deletedAt ? (
            <Card title="Excluir cliente" description="Só é possível excluir clientes sem propostas, contratos ou projetos.">
              <ActionForm action={deleteClientAction.bind(null, id)} submitLabel="Excluir cliente" variant="danger" confirm={`Excluir ${client.name}?`} />
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
