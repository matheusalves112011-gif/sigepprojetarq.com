import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, EmptyRow, FilterBar, Input, PageHeader, Select, TableCard, TD, TH } from "@/components/ui";
import { formatISODate } from "@/lib/format";
import { PROJECT_STATUS, STAGE_STATUS } from "@/lib/labels";
import { can } from "@/lib/rbac/can";
import { requirePermission } from "@/lib/session";
import { listProjects } from "@/modules/projects/service";

export const metadata: Metadata = { title: "Projetos" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string }> }) {
  const { user, grants } = await requirePermission("PROJECTS", "VIEW");
  const sp = await searchParams;
  const rows = await listProjects(user, { q: sp.q, status: sp.situacao });

  return (
    <>
      <PageHeader
        title="Projetos"
        description={user.role === "ADMIN_PRINCIPAL" ? "Todos os projetos." : "Projetos em que você é responsável ou foi autorizado."}
        actions={
          can(user.role, grants, "PROJECTS", "CREATE") ? (
            <Link href="/projetos/novo" className={buttonClass("primary")}>
              Novo projeto
            </Link>
          ) : null
        }
      />
      <FilterBar action="/projetos">
        <Input name="q" defaultValue={sp.q} placeholder="Buscar por código, nome ou cliente" aria-label="Buscar projetos" className="sm:max-w-sm" />
        <Select name="situacao" defaultValue={sp.situacao ?? ""} aria-label="Situação" className="sm:w-48">
          <option value="">Todas as situações</option>
          {Object.entries(PROJECT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </FilterBar>
      <TableCard
        minWidth={860}
        head={
          <tr>
            <th className={TH}>Projeto</th>
            <th className={TH}>Cliente</th>
            <th className={TH}>Etapa atual</th>
            <th className={TH}>Responsável</th>
            <th className={TH}>Prazo final</th>
            <th className={TH}>Situação</th>
          </tr>
        }
      >
        {rows.length === 0 ? <EmptyRow cols={6}>Nenhum projeto encontrado.</EmptyRow> : null}
        {rows.map((p) => (
          <tr key={p.id} data-testid={`project-row-${p.code}`}>
            <td className={TD}>
              <Link href={`/projetos/${p.id}`} className="font-medium text-brand-700 hover:underline">
                {p.code}
              </Link>
              <span className="block text-xs text-slate-500">{p.name}</span>
            </td>
            <td className={`${TD} text-slate-700`}>{p.clientName}</td>
            <td className={TD}>
              {p.stageName && p.status !== "CONCLUIDO" ? (
                <>
                  <span className="text-slate-800">
                    {p.stagePosition}. {p.stageName}
                  </span>
                  {p.stageStatus && p.stageStatus !== "EM_ANDAMENTO" ? (
                    <span className="mt-1 block">
                      <Badge kind={STAGE_STATUS[p.stageStatus].kind}>{STAGE_STATUS[p.stageStatus].label}</Badge>
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </td>
            <td className={`${TD} text-slate-600`}>{p.responsibleName}</td>
            <td className={`${TD} whitespace-nowrap text-slate-600`}>{formatISODate(p.dueDate)}</td>
            <td className={TD}>
              <Badge kind={PROJECT_STATUS[p.status].kind}>{PROJECT_STATUS[p.status].label}</Badge>
              {p.late ? (
                <span className="ml-2">
                  <Badge kind="danger">Atrasado</Badge>
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </TableCard>
    </>
  );
}
