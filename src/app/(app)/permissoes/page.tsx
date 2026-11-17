import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Alert, Card, PageHeader } from "@/components/ui";
import { ACTION_LABELS, ACTIONS, GRANTABLE_ROLES, grantKey, MODULES, ROLE_LABELS } from "@/lib/rbac/modules";
import { getRoleGrants } from "@/lib/rbac/service";
import { requirePermission } from "@/lib/session";
import { AdminTabs } from "../usuarios/tabs";
import { savePermissionsAction } from "./actions";

export const metadata: Metadata = { title: "Permissões" };

const DESCRIPTIONS = {
  OPERACIONAL: "Atualiza projetos, etapas, tarefas e documentos autorizados.",
  CONSULTA: "Apenas visualiza. Este perfil nunca recebe permissão de edição.",
} as const;

export default async function PermissionsPage() {
  await requirePermission("USERS", "EDIT");
  const grants = Object.fromEntries(await Promise.all(GRANTABLE_ROLES.map(async (r) => [r, await getRoleGrants(r)] as const)));
  const grantable = MODULES.filter((m) => !m.adminOnly);
  const adminOnly = MODULES.filter((m) => m.adminOnly);

  return (
    <>
      <PageHeader title="Usuários e permissões" description="Personalize o que cada perfil pode fazer em cada módulo. Toda alteração fica registrada na auditoria." />
      <AdminTabs current="permissoes" />
      <div className="mb-6">
        <Alert kind="info">
          O administrador principal tem acesso integral e não é configurável. {adminOnly.map((m) => m.label).join(", ")} são exclusivos dele.
        </Alert>
      </div>
      <div className="space-y-6">
        {GRANTABLE_ROLES.map((role) => (
          <Card key={role} title={`Perfil ${ROLE_LABELS[role]}`} description={DESCRIPTIONS[role]}>
            <ActionForm action={savePermissionsAction.bind(null, role)} submitLabel={`Salvar permissões de ${ROLE_LABELS[role]}`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                      <th className="py-2 pr-4 text-left">Módulo</th>
                      {ACTIONS.map((a) => (
                        <th key={a} className="px-2 py-2 text-center">
                          {ACTION_LABELS[a]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grantable.map((m) => (
                      <tr key={m.key}>
                        <td className="py-2.5 pr-4 font-medium text-slate-800">{m.label}</td>
                        {ACTIONS.map((a) => {
                          const exists = (m.actions as readonly string[]).includes(a);
                          const locked = role === "CONSULTA" && a !== "VIEW";
                          return (
                            <td key={a} className="px-2 py-2.5 text-center">
                              {exists ? (
                                <input
                                  type="checkbox"
                                  name="g"
                                  value={grantKey(m.key, a)}
                                  defaultChecked={!locked && grants[role].has(grantKey(m.key, a))}
                                  disabled={locked}
                                  aria-label={`${ACTION_LABELS[a]} em ${m.label}`}
                                  className="h-4 w-4 rounded border-slate-300 accent-brand-600 disabled:opacity-40"
                                />
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
