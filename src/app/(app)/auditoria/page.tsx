import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, Input, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { listAudit } from "@/modules/audit/service";

export const metadata: Metadata = { title: "Auditoria" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ pagina?: string; acao?: string }> }) {
  await requirePermission("AUDIT", "VIEW");
  const sp = await searchParams;
  const action = sp.acao?.trim().slice(0, 60) || undefined;
  const { rows, total, page, pages } = await listAudit({ page: Number(sp.pagina) || 1, action });
  const link = (p: number) => `/auditoria?pagina=${p}${action ? `&acao=${encodeURIComponent(action)}` : ""}`;

  return (
    <>
      <PageHeader title="Auditoria" description="Registro somente de inserção: o histórico não pode ser alterado nem apagado, nem pelo administrador." />
      <form className="mb-4 flex max-w-md gap-2" action="/auditoria">
        <Input name="acao" defaultValue={action} placeholder="Filtrar por ação (ex.: LOGIN, USUARIO)" aria-label="Filtrar por ação" />
        <button type="submit" className={buttonClass("secondary")}>
          Filtrar
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-wide text-slate-600 uppercase">
            <tr>
              <th className="px-4 py-3">Data e hora</th>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Ação</th>
              <th className="px-4 py-3">Registro afetado</th>
              <th className="px-4 py-3">Antes / depois</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <p className="text-slate-900">{r.userName ?? "—"}</p>
                    {r.ip ? <p className="text-xs text-slate-500">IP {r.ip}</p> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-700">{r.action}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {r.entity}
                    {r.entityId ? <span className="block break-all text-slate-400">{r.entityId}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.before || r.after ? (
                      <details>
                        <summary className="cursor-pointer font-medium text-brand-600">Ver dados</summary>
                        <pre className="mt-2 max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-[11px] text-slate-700">
                          {JSON.stringify({ antes: r.before, depois: r.after }, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} registro(s) · página {page} de {pages}
        </span>
        <span className="flex gap-2">
          {page > 1 ? (
            <Link href={link(page - 1)} className={buttonClass("secondary")}>
              Anterior
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={link(page + 1)} className={buttonClass("secondary")}>
              Próxima
            </Link>
          ) : null}
        </span>
      </div>
    </>
  );
}
