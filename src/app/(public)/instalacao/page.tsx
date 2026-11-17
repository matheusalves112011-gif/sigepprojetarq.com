import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Field, Input } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/password";
import { isInstalled } from "@/modules/users/service";
import { installAction } from "./actions";

export const metadata: Metadata = { title: "Instalação" };

/** Tela de uso único: deixa de existir (404) assim que o administrador principal é criado. */
export default async function InstallPage() {
  if (await isInstalled()) notFound();
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Instalação inicial</h1>
      <p className="mt-1 mb-4 text-sm text-slate-600">Crie o administrador principal do SIGEP. Esta tela funciona uma única vez.</p>
      <div className="mb-6">
        <Alert kind="info">O código de instalação está definido no servidor (variável SETUP_TOKEN). Não existe senha padrão.</Alert>
      </div>
      <ActionForm action={installAction} submitLabel="Criar administrador principal" pendingLabel="Criando…" fullWidthButton>
        <Field label="Código de instalação" htmlFor="token">
          <Input id="token" name="token" type="password" autoComplete="off" required />
        </Field>
        <Field label="Nome completo" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </Field>
        <Field label="Senha" htmlFor="password" hint={`Mínimo de ${PASSWORD_MIN} caracteres, com letras e números.`}>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} />
        </Field>
        <Field label="Confirmar senha" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
      </ActionForm>
    </div>
  );
}
