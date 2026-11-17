import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, EmptyRow, FilterBar, Input, PageHeader, Select, TableCard, TD, TH } from "@/components/ui";
import { formatISODate, todayISO } from "@/lib/format";
import { CONTRACT_STATUS } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/rbac/can";
import { canSeeValues } from "@/lib/rbac/guard";
import { requirePermission } from "@/lib/session";
import { listContracts } from "@/modules/contracts/service";

export const metadata: Metadata = { title: "Contratos" };

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string; aviso?: string }> }) {
  const { user, grants } = await requirePermission("CONTRACTS", "VIEW");
  const sp = await searchParams;
  const rows = await listContracts(user, { q: sp.q, status: sp.situacao });
  const values = canSeeValues(user.role, grants, "CONTRACTS");
  const today = todayISO();

  return (
    <>
      <PageHeader
        title="Contratos"
        actions={
          can(user.role, grants, "CONTRACTS", "CREATE") ? (
            <Link href="/contratos/novo" className={buttonClass("primary")}>
              Novo contrato
            </Link>
          ) : null
        }
      />
      {sp.aviso === "excluido" ? (
        <div className="mb-4">
          <Alert kind="success">Contrato excluído.</Alert>
        </div>
      ) : null}
      <FilterBar action="/contratos">
        <Input name="q" defaultValue={sp.q} placeholder="Buscar por número, objeto ou cliente" aria-label="Buscar contratos" className="sm:max-w-sm" />
        <Select name="situacao" defaultValue={sp.situacao ?? ""} aria-label="Situação" className="sm:w-48">
          <option value="">Todas as situações</option>
          {Object.entries(CONTRACT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </FilterBar>
      <TableCard
        head={
          <tr>
            <th className={TH}>Contrato</th>
            <th className={TH}>Cliente</th>
            <th className={TH}>Situação</th>
            <th className={TH}>Vigência</th>
            {values ? <th className={`${TH} text-right`}>Valor</th> : null}
          </tr>
        }
      >
        {rows.length === 0 ? <EmptyRow cols={values ? 5 : 4}>Nenhum contrato encontrado.</EmptyRow> : null}
        {rows.map((c) => (
          <tr key={c.id}>
            <td className={TD}>
              <Link href={`/contratos/${c.id}`} className="font-medium text-brand-700 hover:underline">
                {c.number}
              </Link>
              <span className="block text-xs text-slate-500">{c.title}</span>
            </td>
            <td className={`${TD} text-slate-700`}>{c.clientName}</td>
            <td className={TD}>
              <Badge kind={CONTRACT_STATUS[c.status].kind}>{CONTRACT_STATUS[c.status].label}</Badge>
              {c.status === "VIGENTE" && c.endDate && c.endDate < today ? (
                <span className="ml-2">
                  <Badge kind="warning">Prazo vencido</Badge>
                </span>
              ) : null}
            </td>
            <td className={`${TD} whitespace-nowrap text-slate-600`}>
              {formatISODate(c.startDate)} a {formatISODate(c.endDate)}
            </td>
            {values ? <td className={`${TD} text-right whitespace-nowrap text-slate-900`}>{formatBRL(c.value)}</td> : null}
          </tr>
        ))}
      </TableCard>
    </>
  );
}
