import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/password";
import { GRANTABLE_ROLES, ROLE_LABELS } from "@/lib/rbac/modules";
import { requirePermission } from "@/lib/session";
import { createUserAction } from "../actions";

export const metadata: Metadata = { title: "Novo usuário" };

export default async function NewUserPage() {
  await requirePermission("USERS", "CREATE");
  return (
    <>
      <PageHeader title="Novo usuário" description="O usuário entra com a senha provisória e é obrigado a trocá-la no primeiro acesso." />
      <Card className="max-w-xl">
        <ActionForm action={createUserAction} submitLabel="Criar usuário" pendingLabel="Criando…">
          <Field label="Nome completo" htmlFor="name">
            <Input id="name" name="name" required autoFocus />
          </Field>
          <Field label="E-mail" htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="off" />
          </Field>
          <Field label="Perfil" htmlFor="role" hint="Operacional atualiza projetos e tarefas autorizados. Consulta apenas visualiza.">
            <Select id="role" name="role" defaultValue="OPERACIONAL">
              {GRANTABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Senha provisória" htmlFor="password" hint={`Mínimo de ${PASSWORD_MIN} caracteres, com letras e números.`}>
            <Input id="password" name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" />
          </Field>
          <Field label="Confirmar senha provisória" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
          </Field>
        </ActionForm>
        <Link href="/usuarios" className="mt-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-900">
          Cancelar
        </Link>
      </Card>
    </>
  );
}
