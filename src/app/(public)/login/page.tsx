import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Field, Input } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { isInstalled } from "@/modules/users/service";
import { loginAction } from "./actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  if (!(await isInstalled())) redirect("/instalacao");
  if (await getCurrentUser()) redirect("/");
  const { aviso } = await searchParams;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Entrar</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">Use o e-mail e a senha cadastrados pelo administrador.</p>
      {aviso === "senha-redefinida" ? (
        <div className="mb-4">
          <Alert kind="success">Senha redefinida. Entre com a nova senha.</Alert>
        </div>
      ) : null}
      {aviso === "instalado" ? (
        <div className="mb-4">
          <Alert kind="success">Administrador principal criado. Entre para começar.</Alert>
        </div>
      ) : null}
      <ActionForm action={loginAction} submitLabel="Entrar" pendingLabel="Entrando…" fullWidthButton>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </Field>
        <Field label="Senha" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        <Link href="/recuperar-senha" className="font-medium text-brand-600 hover:text-brand-700">
          Esqueci minha senha
        </Link>
      </p>
    </div>
  );
}
