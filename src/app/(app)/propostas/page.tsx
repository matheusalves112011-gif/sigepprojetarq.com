import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, EmptyRow, FilterBar, Input, PageHeader, Select, TableCard, TD, TH } from "@/components/ui";
import { formatISODate } from "@/lib/format";
import { PROPOSAL_STATUS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/rbac/can";
import { canSeeValues } from "@/lib/rbac/guard";
import { requirePermission } from "@/lib/session";
import { listProposals } from "@/modules/proposals/service";

export const metadata: Metadata = { title: "Propostas" };

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string; aviso?: string }> }) {
  const { user, grants } = await requirePermission("PROPOSALS", "VIEW");
  const sp = await searchParams;
  const rows = await listProposals(user, { q: sp.q, status: sp.situacao });
  const values = canSeeValues(user.role, grants, "PROPOSALS");

  return (
    <>
      <PageHeader
        title="Propostas comerciais"
        actions={
          can(user.role, grants, "PROPOSALS", "CREATE") ? (
            <Link href="/propostas/nova" className={buttonClass("primary")}>
              Nova proposta
            </Link>
          ) : null
        }
      />
      {sp.aviso === "excluida" ? (
        <div className="mb-4">
          <Alert kind="success">Proposta excluída.</Alert>
        </div>
      ) : null}
      <FilterBar action="/propostas">
        <Input name="q" defaultValue={sp.q} placeholder="Buscar por número, objeto ou cliente" aria-label="Buscar propostas" className="sm:max-w-sm" />
        <Select name="situacao" defaultValue={sp.situacao ?? ""} aria-label="Situação" className="sm:w-48">
          <option value="">Todas as situações</option>
          {Object.entries(PROPOSAL_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </FilterBar>
      <TableCard
        head={
          <tr>
            <th className={TH}>Proposta</th>
            <th className={TH}>Cliente</th>
            <th className={TH}>Situação</th>
            <th className={TH}>Validade</th>
            {values ? <th className={`${TH} text-right`}>Valor</th> : null}
          </tr>
        }
      >
        {rows.length === 0 ? <EmptyRow cols={values ? 5 : 4}>Nenhuma proposta encontrada.</EmptyRow> : null}
        {rows.map((p) => (
          <tr key={p.id}>
            <td className={TD}>
              <Link href={`/propostas/${p.id}`} className="font-medium text-brand-700 hover:underline">
                {p.number}
              </Link>
              <span className="block text-xs text-slate-500">{p.title}</span>
            </td>
            <td className={`${TD} text-slate-700`}>{p.clientName}</td>
            <td className={TD}>
              <Badge kind={PROPOSAL_STATUS[p.status].kind}>{PROPOSAL_STATUS[p.status].label}</Badge>
              {p.expired ? (
                <span className="ml-2">
                  <Badge kind="danger">Vencida</Badge>
                </span>
              ) : null}
            </td>
            <td className={`${TD} whitespace-nowrap text-slate-600`}>{formatISODate(p.validUntil)}</td>
            {values ? <td className={`${TD} text-right whitespace-nowrap text-slate-900`}>{formatBRL(p.value)}</td> : null}
          </tr>
        ))}
      </TableCard>
    </>
  );
}
