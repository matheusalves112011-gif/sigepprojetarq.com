import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { recoverAction } from "./actions";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecoverPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Recuperar senha</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">Informe seu e-mail para receber o link de redefinição.</p>
      <ActionForm action={recoverAction} submitLabel="Enviar link" pendingLabel="Enviando…" fullWidthButton resetOnSuccess>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </Field>
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
