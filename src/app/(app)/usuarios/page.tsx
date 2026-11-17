import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/rbac/modules";
import { requirePermission } from "@/lib/session";
import { listUsers } from "@/modules/users/service";
import { AdminTabs } from "./tabs";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  await requirePermission("USERS", "VIEW");
  const [rows, { aviso }] = await Promise.all([listUsers(), searchParams]);

  return (
    <>
      <PageHeader
        title="Usuários e permissões"
        description="Somente o administrador principal cadastra, bloqueia e define permissões."
        actions={
          <Link href="/usuarios/novo" className={buttonClass("primary")}>
            Novo usuário
          </Link>
        }
      />
      <AdminTabs current="usuarios" />
      {aviso === "criado" ? (
        <div className="mb-4">
          <Alert kind="success">Usuário criado. Informe a ele a senha provisória; a troca será exigida no primeiro acesso.</Alert>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold tracking-wide text-slate-600 uppercase">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Perfil</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3 text-right">Sessões</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.email}`}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge kind={u.role === "ADMIN_PRINCIPAL" ? "brand" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>
                </td>
                <td className="px-4 py-3">
                  {u.status === "ATIVO" ? <Badge kind="success">Ativo</Badge> : <Badge kind="danger">Bloqueado</Badge>}
                  {u.mustChangePassword ? <span className="ml-2 text-xs text-amber-700">senha provisória</span> : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(u.lastLoginAt)}</td>
                <td className="px-4 py-3 text-right text-slate-600">{u.activeSessions}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/usuarios/${u.id}`} className="font-medium text-brand-600 hover:text-brand-700">
                    Gerenciar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
