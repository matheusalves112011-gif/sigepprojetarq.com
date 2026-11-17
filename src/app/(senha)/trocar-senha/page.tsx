import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Brand, Card, Field, Input } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/password";
import { requireUser } from "@/lib/session";
import { logoutAction } from "../../(app)/actions";
import { changePasswordAction } from "./actions";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function ForcedPasswordPage() {
  const user = await requireUser({ allowPendingPasswordChange: true });
  if (!user.mustChangePassword) redirect("/conta");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand tone="light" />
        </div>
        <Card title="Defina sua senha" description={`Olá, ${user.name}. Sua senha atual é provisória; escolha uma nova para continuar.`}>
          <ActionForm action={changePasswordAction} submitLabel="Salvar e continuar" fullWidthButton>
            <Field label="Senha provisória" htmlFor="currentPassword">
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required autoFocus />
            </Field>
            <Field label="Nova senha" htmlFor="newPassword" hint={`Mínimo de ${PASSWORD_MIN} caracteres, com letras e números.`}>
              <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} />
            </Field>
            <Field label="Confirmar nova senha" htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </Field>
          </ActionForm>
          <form action={logoutAction} className="mt-4 text-center">
            <button type="submit" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Sair
            </button>
          </form>
        </Card>
      </div>
    </main>
  );
}
