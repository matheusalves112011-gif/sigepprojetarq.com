import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, EmptyRow, FilterBar, Input, PageHeader, TableCard, TD, TH } from "@/components/ui";
import { formatDocument } from "@/lib/documents";
import { can } from "@/lib/rbac/can";
import { requirePermission } from "@/lib/session";
import { listClients } from "@/modules/clients/service";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; excluidos?: string; aviso?: string }> }) {
  const { user, grants } = await requirePermission("CLIENTS", "VIEW");
  const sp = await searchParams;
  const isAdmin = user.role === "ADMIN_PRINCIPAL";
  const deleted = sp.excluidos === "1" && isAdmin;
  const rows = await listClients(user, { q: sp.q, deleted });

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Pessoas físicas e jurídicas atendidas pela PROJETARQ."
        actions={
          can(user.role, grants, "CLIENTS", "CREATE") ? (
            <Link href="/clientes/novo" className={buttonClass("primary")}>
              Novo cliente
            </Link>
          ) : null
        }
      />
      {sp.aviso === "excluido" ? (
        <div className="mb-4">
          <Alert kind="success">Cliente excluído. O administrador pode restaurá-lo na lista de excluídos.</Alert>
        </div>
      ) : null}
      <FilterBar action="/clientes">
        <Input name="q" defaultValue={sp.q} placeholder="Buscar por nome, CPF ou CNPJ" aria-label="Buscar clientes" className="sm:max-w-sm" />
        {isAdmin ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="excluidos" value="1" defaultChecked={deleted} className="h-4 w-4 accent-brand-600" /> Mostrar excluídos
          </label>
        ) : null}
      </FilterBar>
      <TableCard
        head={
          <tr>
            <th className={TH}>Cliente</th>
            <th className={TH}>CPF / CNPJ</th>
            <th className={TH}>Contato</th>
            <th className={TH}>Cidade</th>
          </tr>
        }
      >
        {rows.length === 0 ? <EmptyRow cols={4}>Nenhum cliente encontrado.</EmptyRow> : null}
        {rows.map((c) => (
          <tr key={c.id}>
            <td className={TD}>
              <Link href={`/clientes/${c.id}`} className="font-medium text-brand-700 hover:underline">
                {c.name}
              </Link>
              <span className="ml-2">
                <Badge>{c.type === "PJ" ? "PJ" : "PF"}</Badge>
              </span>
              {c.deletedAt ? (
                <span className="ml-2">
                  <Badge kind="danger">Excluído</Badge>
                </span>
              ) : null}
            </td>
            <td className={`${TD} whitespace-nowrap text-slate-600`}>{formatDocument(c.document)}</td>
            <td className={`${TD} text-slate-600`}>
              {c.contactName ?? "—"}
              {c.phone ? <span className="block text-xs text-slate-500">{c.phone}</span> : null}
            </td>
            <td className={`${TD} text-slate-600`}>{c.city ? `${c.city}${c.state ? `/${c.state}` : ""}` : "—"}</td>
          </tr>
        ))}
      </TableCard>
      <p className="mt-3 text-xs text-slate-500">{rows.length} cliente(s) exibido(s). A lista mostra até 300 registros; use a busca para refinar.</p>
    </>
  );
}
