import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, EmptyRow, FilterBar, PageHeader, Select, TableCard, TD, TH } from "@/components/ui";
import { formatISODate } from "@/lib/format";
import { STAGE_STATUS } from "@/lib/labels";
import { requirePermission } from "@/lib/session";
import { listProjects } from "@/modules/projects/service";

export const metadata: Metadata = { title: "Tramitação" };

export default async function WorkflowPage({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  const { user } = await requirePermission("WORKFLOW", "VIEW");
  const sp = await searchParams;
  const rows = await listProjects(user, { status: "ATIVO", stageStatus: sp.situacao });

  return (
    <>
      <PageHeader
        title="Tramitação"
        description="Projetos ativos e a etapa em que cada um está. A tramitação é feita na aba Tramitação do projeto."
        actions={
          user.role === "ADMIN_PRINCIPAL" ? (
            <Link href="/tramitacao/fluxos" className={buttonClass("secondary")}>
              Configurar fluxos
            </Link>
          ) : null
        }
      />
      <FilterBar action="/tramitacao">
        <Select name="situacao" defaultValue={sp.situacao ?? ""} aria-label="Situação da etapa" className="sm:w-64">
          <option value="">Todas as situações</option>
          <option value="EM_ANDAMENTO">Em andamento</option>
          <option value="AGUARDANDO_CLIENTE">Aguardando cliente</option>
          <option value="AGUARDANDO_ORGAO">Aguardando órgão público</option>
        </Select>
      </FilterBar>
      <TableCard
        minWidth={820}
        head={
          <tr>
            <th className={TH}>Projeto</th>
            <th className={TH}>Cliente</th>
            <th className={TH}>Etapa atual</th>
            <th className={TH}>Situação</th>
            <th className={TH}>Prazo da etapa</th>
            <th className={TH} />
          </tr>
        }
      >
        {rows.length === 0 ? <EmptyRow cols={6}>Nenhum projeto ativo nesta situação.</EmptyRow> : null}
        {rows.map((p) => (
          <tr key={p.id}>
            <td className={TD}>
              <span className="font-medium text-slate-900">{p.code}</span>
              <span className="block text-xs text-slate-500">{p.name}</span>
            </td>
            <td className={`${TD} text-slate-700`}>{p.clientName}</td>
            <td className={`${TD} text-slate-800`}>
              {p.stagePosition}. {p.stageName}
            </td>
            <td className={TD}>{p.stageStatus ? <Badge kind={STAGE_STATUS[p.stageStatus].kind}>{STAGE_STATUS[p.stageStatus].label}</Badge> : null}</td>
            <td className={`${TD} whitespace-nowrap text-slate-600`}>
              {formatISODate(p.stageDueDate)}
              {p.late ? (
                <span className="ml-2">
                  <Badge kind="danger">Atrasado</Badge>
                </span>
              ) : null}
            </td>
            <td className={`${TD} text-right`}>
              <Link href={`/projetos/${p.id}?aba=tramitacao`} className="font-medium text-brand-600 hover:text-brand-700">
                Tramitar
              </Link>
            </td>
          </tr>
        ))}
      </TableCard>
    </>
  );
}
