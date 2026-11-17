import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { PASSWORD_MIN } from "@/lib/password";
import { GRANTABLE_ROLES, ROLE_LABELS } from "@/lib/rbac/modules";
import { requirePermission } from "@/lib/session";
import { getUser } from "@/modules/users/service";
import { adminResetPasswordAction, setStatusAction, updateUserAction } from "../actions";

export const metadata: Metadata = { title: "Gerenciar usuário" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("USERS", "EDIT");
  const { id } = await params;
  const user = await getUser(id);
  if (!user) notFound();
  const primary = user.role === "ADMIN_PRINCIPAL";
  const blocked = user.status === "BLOQUEADO";

  return (
    <>
      <PageHeader
        title={user.name}
        description={`${user.email} · criado em ${formatDateTime(user.createdAt)} · último acesso: ${formatDateTime(user.lastLoginAt)}`}
        actions={
          <>
            <Badge kind={primary ? "brand" : "neutral"}>{ROLE_LABELS[user.role]}</Badge>
            {blocked ? <Badge kind="danger">Bloqueado</Badge> : <Badge kind="success">Ativo</Badge>}
          </>
        }
      />
      <Link href="/usuarios" className="mb-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
        ← Voltar para usuários
      </Link>

      {primary ? (
        <Alert kind="info">
          O administrador principal não pode ser bloqueado, rebaixado nem excluído. Para trocar a própria senha, use a tela Minha conta.
        </Alert>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Dados e perfil">
            <ActionForm action={updateUserAction.bind(null, user.id)} submitLabel="Salvar alterações">
              <Field label="Nome completo" htmlFor="name">
                <Input id="name" name="name" defaultValue={user.name} required />
              </Field>
              <Field label="E-mail" htmlFor="email" hint="O e-mail identifica a conta e não é alterado nesta tela.">
                <Input id="email" defaultValue={user.email} disabled />
              </Field>
              <Field label="Perfil" htmlFor="role">
                <Select id="role" name="role" defaultValue={user.role}>
                  {GRANTABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
          </Card>

          <div className="space-y-6">
            <Card
              title={blocked ? "Reativar acesso" : "Bloquear acesso"}
              description={
                blocked
                  ? "O usuário volta a poder entrar com a senha que já possui."
                  : "O usuário é desconectado imediatamente e não consegue mais entrar. Os registros dele são preservados."
              }
            >
              <ActionForm
                action={setStatusAction.bind(null, user.id, blocked ? "ATIVO" : "BLOQUEADO")}
                submitLabel={blocked ? "Reativar usuário" : "Bloquear usuário"}
                variant={blocked ? "success" : "danger"}
                confirm={blocked ? undefined : `Bloquear ${user.name}? As sessões abertas serão encerradas.`}
              />
            </Card>

            <Card title="Redefinir senha" description="Define uma senha provisória e encerra as sessões abertas do usuário.">
              <ActionForm action={adminResetPasswordAction.bind(null, user.id)} submitLabel="Definir senha provisória" variant="secondary" resetOnSuccess>
                <Field label="Nova senha provisória" htmlFor="password" hint={`Mínimo de ${PASSWORD_MIN} caracteres, com letras e números.`}>
                  <Input id="password" name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" />
                </Field>
                <Field label="Confirmar" htmlFor="confirm">
                  <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
                </Field>
              </ActionForm>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
