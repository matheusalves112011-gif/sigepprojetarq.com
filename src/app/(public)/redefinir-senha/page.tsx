import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Alert, Field, Input } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/password";
import { resetAction } from "./actions";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Redefinir senha</h1>
      {!token ? (
        <div className="mt-6">
          <Alert kind="error">Link inválido. Solicite um novo link de redefinição.</Alert>
        </div>
      ) : (
        <>
          <p className="mt-1 mb-6 text-sm text-slate-600">Escolha uma nova senha. O link vale para um único uso.</p>
          <ActionForm action={resetAction} submitLabel="Salvar nova senha" fullWidthButton>
            <input type="hidden" name="token" value={token} />
            <Field label="Nova senha" htmlFor="password" hint={`Mínimo de ${PASSWORD_MIN} caracteres, com letras e números.`}>
              <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} />
            </Field>
            <Field label="Confirmar nova senha" htmlFor="confirm">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </Field>
          </ActionForm>
        </>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/recuperar-senha" className="font-medium text-brand-600 hover:text-brand-700">
          Solicitar novo link
        </Link>
      </p>
    </div>
  );
}
