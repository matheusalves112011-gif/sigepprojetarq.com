import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { todayISO } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { listActiveUsers, listServiceTypes } from "@/modules/catalog/service";
import { listClientOptions } from "@/modules/clients/service";
import { listContractOptions } from "@/modules/contracts/service";
import { createProjectAction } from "../actions";

export const metadata: Metadata = { title: "Novo projeto" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ contrato?: string }> }) {
  const { user } = await requirePermission("PROJECTS", "CREATE");
  const [clients, contracts, serviceTypes, users, sp] = await Promise.all([listClientOptions(), listContractOptions(), listServiceTypes(), listActiveUsers(), searchParams]);
  const origin = contracts.find((c) => c.id === sp.contrato);

  return (
    <>
      <PageHeader title="Novo projeto" description="O projeto recebe código automático e as etapas do fluxo da modalidade escolhida." />
      <Card className="max-w-4xl">
        <ActionForm action={createProjectAction} submitLabel="Criar projeto" pendingLabel="Criando…">
          <Field label="Nome do projeto (descrição do objeto)" htmlFor="name">
            <Input id="name" name="name" defaultValue={origin?.title} required maxLength={200} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Cliente" htmlFor="clientId">
              <Select id="clientId" name="clientId" defaultValue={origin?.clientId ?? ""} required>
                <option value="">Selecione…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Contrato" htmlFor="contractId" hint="Opcional. Deve ser do mesmo cliente.">
              <Select id="contractId" name="contractId" defaultValue={origin?.id ?? ""}>
                <option value="">Sem contrato</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number} · {c.clientName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Modalidade" htmlFor="serviceTypeId" hint="Define o fluxo de etapas do projeto.">
              <Select id="serviceTypeId" name="serviceTypeId" defaultValue="" required>
                <option value="">Selecione…</option>
                {serviceTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Responsável" htmlFor="responsibleId">
              <Select id="responsibleId" name="responsibleId" defaultValue={user.id} required>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Início" htmlFor="startDate">
              <Input id="startDate" name="startDate" type="date" defaultValue={todayISO()} required />
            </Field>
            <Field label="Prazo final" htmlFor="dueDate">
              <Input id="dueDate" name="dueDate" type="date" />
            </Field>
          </div>
          <Field label="Local da obra" htmlFor="location">
            <Input id="location" name="location" maxLength={240} />
          </Field>
          <Field label="Descrição" htmlFor="description">
            <Textarea id="description" name="description" maxLength={5000} />
          </Field>
        </ActionForm>
        <Link href="/projetos" className="mt-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-900">
          Cancelar
        </Link>
      </Card>
    </>
  );
}
