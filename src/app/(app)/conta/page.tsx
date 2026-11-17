import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/password";
import { ROLE_LABELS } from "@/lib/rbac/modules";
import { requireUser } from "@/lib/session";
import { changePasswordAction } from "../../(senha)/trocar-senha/actions";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Minha conta" description="Seus dados de acesso. O perfil só pode ser alterado pelo administrador principal." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Dados">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Nome</dt>
              <dd className="font-medium text-slate-900">{user.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">E-mail</dt>
              <dd className="font-medium text-slate-900">{user.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Perfil</dt>
              <dd className="font-medium text-slate-900">{ROLE_LABELS[user.role]}</dd>
            </div>
          </dl>
        </Card>
        <Card title="Trocar senha" description="Ao trocar a senha, as outras sessões desta conta são encerradas.">
          <ActionForm action={changePasswordAction} submitLabel="Alterar senha" resetOnSuccess>
            <Field label="Senha atual" htmlFor="currentPassword">
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
            </Field>
            <Field label="Nova senha" htmlFor="newPassword" hint={`Mínimo de ${PASSWORD_MIN} caracteres, com letras e números.`}>
              <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} />
            </Field>
            <Field label="Confirmar nova senha" htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
