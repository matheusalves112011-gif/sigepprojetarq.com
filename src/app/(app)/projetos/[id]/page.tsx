import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Alert, Badge, buttonClass, Card, Field, Input, PageHeader, ReadOnly, Select, Tabs, Textarea } from "@/components/ui";
import { formatDateTime, formatISODate, todayISO } from "@/lib/format";
import { DISCIPLINE_STATUS, PROJECT_STATUS, STAGE_STATUS, TASK_PRIORITY, TASK_STATUS, TRANSITION_KIND } from "@/lib/labels";
import { can } from "@/lib/rbac/can";
import type { Action, ModuleKey } from "@/lib/rbac/modules";
import { ROLE_LABELS } from "@/lib/rbac/modules";
import { requirePermission, type SessionUser } from "@/lib/session";
import { listActiveUsers } from "@/modules/catalog/service";
import { listContractOptions } from "@/modules/contracts/service";
import { listDisciplines, listProjectDisciplines } from "@/modules/disciplines/service";
import { getProject, listAssignableUsers, listMembers, projectNextStatuses } from "@/modules/projects/service";
import { listTasks } from "@/modules/tasks/service";
import { listStages, listTransitions } from "@/modules/workflow/service";
import {
  addDisciplineAction,
  addMemberAction,
  advanceStageAction,
  projectStatusAction,
  removeDisciplineAction,
  removeMemberAction,
  returnStageAction,
  stageApplicableAction,
  stageStatusAction,
  updateDisciplineAction,
  updateProjectAction,
  updateStageAction,
} from "../actions";

export const metadata: Metadata = { title: "Projeto" };

type Loaded = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type Allow = (m: ModuleKey, a: Action) => boolean;
type Ctx = { user: SessionUser; data: Loaded; allow: Allow };

const STATUS_ACTION = { PAUSADO: "Pausar projeto", ATIVO: "Retomar projeto", CANCELADO: "Cancelar projeto", CONCLUIDO: "" } as const;

function UserSelect({ id, name, users, value, empty }: { id: string; name: string; users: { id: string; name: string }[]; value?: string | null; empty?: string }) {
  return (
    <Select id={id} name={name} defaultValue={value ?? ""}>
      {empty ? <option value="">{empty}</option> : null}
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </Select>
  );
}

async function Overview({ user, data, allow }: Ctx) {
  const p = data.project;
  const isAdmin = user.role === "ADMIN_PRINCIPAL";
  const canEdit = allow("PROJECTS", "EDIT") && p.status !== "CANCELADO";
  const [users, contracts, members] = await Promise.all([listActiveUsers(), listContractOptions(), listMembers(user, p.id)]);
  const contractOptions = contracts.filter((c) => c.clientId === p.clientId);
  if (p.contractId && data.contractNumber && !contractOptions.some((c) => c.id === p.contractId)) {
    contractOptions.unshift({ id: p.contractId, number: data.contractNumber, title: "", clientId: p.clientId, clientName: data.clientName });
  }
  const candidates = users.filter((u) => !members.some((m) => m.userId === u.id) && u.role !== "ADMIN_PRINCIPAL");

  const fields = (
    <>
      <Field label="Nome do projeto" htmlFor="name">
        <Input id="name" name="name" defaultValue={p.name} required maxLength={200} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Responsável" htmlFor="responsibleId">
          <UserSelect id="responsibleId" name="responsibleId" users={users.some((u) => u.id === p.responsibleId) ? users : [{ id: p.responsibleId, name: data.responsibleName }, ...users]} value={p.responsibleId} />
        </Field>
        <Field label="Contrato" htmlFor="contractId">
          <Select id="contractId" name="contractId" defaultValue={p.contractId ?? ""}>
            <option value="">Sem contrato</option>
            {contractOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.number}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Início" htmlFor="startDate">
          <Input id="startDate" defaultValue={p.startDate} type="date" disabled />
        </Field>
        <Field label="Prazo final" htmlFor="dueDate">
          <Input id="dueDate" name="dueDate" type="date" defaultValue={p.dueDate ?? ""} />
        </Field>
      </div>
      <Field label="Local da obra" htmlFor="location">
        <Input id="location" name="location" defaultValue={p.location ?? ""} maxLength={240} />
      </Field>
      <Field label="Descrição" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={p.description ?? ""} maxLength={5000} />
      </Field>
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card title="Dados do projeto" description={`Cliente: ${data.clientName} · Modalidade: ${data.serviceTypeName}`} className="xl:col-span-2">
        {canEdit ? (
          <ActionForm action={updateProjectAction.bind(null, p.id)} submitLabel="Salvar alterações">
            {fields}
          </ActionForm>
        ) : (
          <ReadOnly>{fields}</ReadOnly>
        )}
      </Card>
      <div className="space-y-6">
        <Card title="Equipe autorizada" description="Além do administrador, só estas pessoas veem o projeto.">
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  <span className="font-medium text-slate-900">{m.name}</span>
                  <span className="block text-xs text-slate-500">
                    {ROLE_LABELS[m.role]}
                    {m.isResponsible ? " · responsável" : ""}
                    {m.status === "BLOQUEADO" ? " · bloqueado" : ""}
                  </span>
                </span>
                {isAdmin && !m.isResponsible ? (
                  <ActionForm action={removeMemberAction.bind(null, p.id, m.userId)} submitLabel="Remover" variant="secondary" className="space-y-1" />
                ) : null}
              </li>
            ))}
          </ul>
          {isAdmin && candidates.length > 0 ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <ActionForm action={addMemberAction.bind(null, p.id)} submitLabel="Autorizar usuário" variant="secondary">
                <Field label="Autorizar outro usuário" htmlFor="userId">
                  <UserSelect id="userId" name="userId" users={candidates} />
                </Field>
              </ActionForm>
            </div>
          ) : null}
        </Card>
        {projectNextStatuses(p.status).some((to) => allow("PROJECTS", to === "CANCELADO" ? "DELETE" : "EDIT")) ? (
          <Card title="Situação do projeto">
            <div className="space-y-3">
              {projectNextStatuses(p.status)
                .filter((to) => allow("PROJECTS", to === "CANCELADO" ? "DELETE" : "EDIT"))
                .map((to) => (
                  <ActionForm
                    key={to}
                    action={projectStatusAction.bind(null, p.id, to)}
                    submitLabel={STATUS_ACTION[to]}
                    variant={to === "CANCELADO" ? "danger" : "secondary"}
                    confirm={to === "CANCELADO" ? "Cancelar o projeto? Esta mudança não pode ser desfeita." : undefined}
                    fullWidthButton
                  />
                ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

async function Workflow({ user, data, allow }: Ctx) {
  const p = data.project;
  const [stages, history, assignable] = await Promise.all([listStages(user, p.id), listTransitions(user, p.id), listAssignableUsers(user, p.id)]);
  const today = todayISO();
  const current = stages.find((s) => s.id === p.currentStageId);
  const active = p.status === "ATIVO" && current !== undefined;
  const canEdit = allow("WORKFLOW", "EDIT");
  const canApprove = allow("WORKFLOW", "APPROVE");
  const isLast = current ? !stages.some((s) => s.position > current.position && s.status !== "CANCELADA") : false;
  const hasPrevious = current ? stages.some((s) => s.position < current.position && s.status !== "CANCELADA") : false;

  return (
    <div className="space-y-6">
      {active && current ? (
        <Card title={`Etapa atual: ${current.position}. ${current.name}`} description={`Situação: ${STAGE_STATUS[current.status].label} · prazo: ${formatISODate(current.dueDate)}`}>
          {canEdit ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <ActionForm
                action={advanceStageAction.bind(null, p.id)}
                submitLabel={isLast ? "Concluir etapa e projeto" : "Tramitar para a próxima etapa"}
                variant="success"
                confirm={isLast ? "Esta é a última etapa. Concluir o projeto?" : undefined}
                resetOnSuccess
              >
                <Field label="Despacho (opcional)" htmlFor="advance-note">
                  <Textarea id="advance-note" name="note" rows={2} maxLength={1000} />
                </Field>
              </ActionForm>
              <ActionForm action={stageStatusAction.bind(null, p.id)} submitLabel="Atualizar situação" variant="secondary" resetOnSuccess>
                <Field label="Situação da etapa" htmlFor="stage-status">
                  <Select id="stage-status" name="status" defaultValue={current.status}>
                    <option value="EM_ANDAMENTO">Em andamento</option>
                    <option value="AGUARDANDO_CLIENTE">Aguardando cliente</option>
                    <option value="AGUARDANDO_ORGAO">Aguardando órgão público</option>
                  </Select>
                </Field>
                <Field label="Observação (opcional)" htmlFor="status-note">
                  <Input id="status-note" name="note" maxLength={1000} />
                </Field>
              </ActionForm>
              {canApprove && hasPrevious ? (
                <ActionForm action={returnStageAction.bind(null, p.id)} submitLabel="Devolver à etapa anterior" variant="danger" resetOnSuccess>
                  <Field label="Motivo da devolução" htmlFor="return-note">
                    <Textarea id="return-note" name="note" rows={2} maxLength={1000} required />
                  </Field>
                </ActionForm>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Seu perfil apenas visualiza a tramitação.</p>
          )}
        </Card>
      ) : (
        <Alert kind="info">
          {p.status === "CONCLUIDO" ? "Projeto concluído: todas as etapas foram tramitadas." : `Projeto ${PROJECT_STATUS[p.status].label.toLowerCase()}: a tramitação está parada.`}
        </Alert>
      )}

      <Card title="Etapas do fluxo">
        <ol className="divide-y divide-slate-100">
          {stages.map((s) => {
            const late = s.dueDate !== null && s.dueDate < today && s.status !== "CONCLUIDA" && s.status !== "CANCELADA" && p.status === "ATIVO";
            const toggle = canApprove && (s.status === "NAO_INICIADA" || s.status === "CANCELADA") && (p.status === "ATIVO" || p.status === "PAUSADO");
            return (
              <li key={s.id} className="py-3" data-testid={`stage-${s.position}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className={s.id === p.currentStageId && active ? "font-semibold text-slate-900" : "text-slate-800"}>
                      {s.position}. {s.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Responsável: {s.responsibleName ?? "não definido"} · prazo: {formatISODate(s.dueDate)}
                      {s.completedAt ? ` · concluída em ${formatDateTime(s.completedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {late ? <Badge kind="danger">Atrasada</Badge> : null}
                    <Badge kind={STAGE_STATUS[s.status].kind}>{STAGE_STATUS[s.status].label}</Badge>
                  </div>
                </div>
                {(canEdit && s.status !== "CONCLUIDA" && s.status !== "CANCELADA" && p.status !== "CANCELADO" && p.status !== "CONCLUIDO") || toggle ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-brand-600">Responsável, prazo e aplicabilidade</summary>
                    <div className="mt-3 grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 lg:grid-cols-2">
                      {canEdit && s.status !== "CANCELADA" ? (
                        <ActionForm action={updateStageAction.bind(null, p.id, s.id)} submitLabel="Salvar etapa" variant="secondary">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Responsável" htmlFor={`resp-${s.id}`}>
                              <UserSelect id={`resp-${s.id}`} name="responsibleId" users={assignable} value={s.responsibleId} empty="Não definido" />
                            </Field>
                            <Field label="Prazo" htmlFor={`due-${s.id}`}>
                              <Input id={`due-${s.id}`} name="dueDate" type="date" defaultValue={s.dueDate ?? ""} />
                            </Field>
                          </div>
                        </ActionForm>
                      ) : null}
                      {toggle ? (
                        <ActionForm
                          action={stageApplicableAction.bind(null, p.id, s.id, s.status === "CANCELADA")}
                          submitLabel={s.status === "CANCELADA" ? "Reativar etapa" : "Marcar como não aplicável"}
                          variant="secondary"
                        />
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Card>

      <Card title="Histórico de tramitação" description="Registro somente de inserção.">
        <ul className="divide-y divide-slate-100">
          {history.map((h) => (
            <li key={h.id} className="py-2.5 text-sm">
              <p className="text-slate-800">
                <span className="font-medium">{TRANSITION_KIND[h.kind]}</span>
                {h.kind === "SITUACAO" && h.toStatus ? `: ${h.toName} → ${STAGE_STATUS[h.toStatus].label}` : null}
                {h.kind === "AVANCO" || h.kind === "DEVOLUCAO" ? `: ${h.fromName} → ${h.toName}` : null}
                {h.kind === "INICIO" ? `: ${h.toName}` : null}
                {h.kind === "CONCLUSAO" ? `: ${h.fromName}` : null}
              </p>
              {h.note ? <p className="text-slate-600">“{h.note}”</p> : null}
              <p className="text-xs text-slate-500">
                {h.userName} · {formatDateTime(h.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

async function Disciplines({ user, data, allow }: Ctx) {
  const p = data.project;
  const [rows, catalog, assignable] = await Promise.all([listProjectDisciplines(user, p.id), listDisciplines(user), listAssignableUsers(user, p.id)]);
  const open = p.status === "ATIVO" || p.status === "PAUSADO";
  const canEdit = allow("DISCIPLINES", "EDIT") && p.status !== "CANCELADO";
  const available = catalog.filter((d) => d.active && !rows.some((r) => r.disciplineId === d.id));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card title="Disciplinas do projeto" className="xl:col-span-2">
        {rows.length === 0 ? <p className="text-sm text-slate-500">Nenhuma disciplina incluída.</p> : null}
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500">
                    Responsável técnico: {r.responsibleName ?? "não definido"} · ART/RRT: {r.artNumber ?? "não informada"}
                  </p>
                </div>
                <Badge kind={DISCIPLINE_STATUS[r.status].kind}>{DISCIPLINE_STATUS[r.status].label}</Badge>
              </div>
              {canEdit ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-brand-600">Atualizar</summary>
                  <div className="mt-3 space-y-4 rounded-lg bg-slate-50 p-4">
                    <ActionForm action={updateDisciplineAction.bind(null, p.id, r.id)} submitLabel="Salvar disciplina" variant="secondary">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Field label="Responsável técnico" htmlFor={`dr-${r.id}`}>
                          <UserSelect id={`dr-${r.id}`} name="responsibleId" users={assignable} value={r.responsibleId} empty="Não definido" />
                        </Field>
                        <Field label="Situação" htmlFor={`ds-${r.id}`}>
                          <Select id={`ds-${r.id}`} name="status" defaultValue={r.status}>
                            {Object.entries(DISCIPLINE_STATUS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Número da ART/RRT" htmlFor={`da-${r.id}`}>
                          <Input id={`da-${r.id}`} name="artNumber" defaultValue={r.artNumber ?? ""} maxLength={60} />
                        </Field>
                      </div>
                    </ActionForm>
                    {allow("DISCIPLINES", "DELETE") ? (
                      <ActionForm action={removeDisciplineAction.bind(null, p.id, r.id)} submitLabel="Remover do projeto" variant="danger" confirm={`Remover ${r.name} deste projeto?`} />
                    ) : null}
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      {canEdit && open ? (
        <Card title="Incluir disciplina">
          {available.length === 0 ? (
            <p className="text-sm text-slate-500">Todas as disciplinas ativas já estão no projeto.</p>
          ) : (
            <ActionForm action={addDisciplineAction.bind(null, p.id)} submitLabel="Incluir" resetOnSuccess>
              <Field label="Disciplina" htmlFor="disciplineId">
                <Select id="disciplineId" name="disciplineId" defaultValue="" required>
                  <option value="">Selecione…</option>
                  {available.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Responsável técnico" htmlFor="disc-resp">
                <UserSelect id="disc-resp" name="responsibleId" users={assignable} empty="Não definido" />
              </Field>
            </ActionForm>
          )}
        </Card>
      ) : null}
    </div>
  );
}

async function Tasks({ user, data, allow }: Ctx) {
  const p = data.project;
  const rows = await listTasks(user, { projectId: p.id });
  const open = p.status === "ATIVO" || p.status === "PAUSADO";
  return (
    <Card title="Tarefas do projeto">
      {rows.length === 0 ? <p className="text-sm text-slate-500">Nenhuma tarefa neste projeto.</p> : null}
      <ul className="divide-y divide-slate-100">
        {rows.map((t) => (
          <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link href={`/tarefas/${t.id}`} className="font-medium text-brand-700 hover:underline">
                {t.title}
              </Link>
              <p className="text-xs text-slate-500">
                {t.assigneeName ?? "Sem responsável"} · prazo: {formatISODate(t.dueDate)}
                {t.stageName ? ` · etapa: ${t.stageName}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {t.late ? <Badge kind="danger">Atrasada</Badge> : null}
              <Badge kind={TASK_PRIORITY[t.priority].kind}>{TASK_PRIORITY[t.priority].label}</Badge>
              <Badge kind={TASK_STATUS[t.status].kind}>{TASK_STATUS[t.status].label}</Badge>
            </div>
          </li>
        ))}
      </ul>
      {allow("TASKS", "CREATE") && open ? (
        <Link href={`/tarefas/nova?projeto=${p.id}`} className={buttonClass("primary", "mt-4")}>
          Nova tarefa
        </Link>
      ) : null}
    </Card>
  );
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; aviso?: string }> }) {
  const { user, grants } = await requirePermission("PROJECTS", "VIEW");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await getProject(user, id);
  if (!data) notFound();
  const allow: Allow = (m, a) => can(user.role, grants, m, a);
  const p = data.project;

  const tabs = [
    { key: "visao", label: "Visão geral", show: true },
    { key: "tramitacao", label: "Tramitação", show: allow("WORKFLOW", "VIEW") },
    { key: "disciplinas", label: "Disciplinas", show: allow("DISCIPLINES", "VIEW") },
    { key: "tarefas", label: "Tarefas", show: allow("TASKS", "VIEW") },
  ].filter((t) => t.show);
  const tab = tabs.find((t) => t.key === sp.aba)?.key ?? "visao";
  const ctx: Ctx = { user, data, allow };

  return (
    <>
      <PageHeader
        title={`${p.code} · ${p.name}`}
        description={`${data.clientName} · ${data.serviceTypeName} · responsável: ${data.responsibleName}${data.contractNumber ? ` · contrato ${data.contractNumber}` : ""}`}
        actions={<Badge kind={PROJECT_STATUS[p.status].kind}>{PROJECT_STATUS[p.status].label}</Badge>}
      />
      {sp.aviso === "criado" ? (
        <div className="mb-4">
          <Alert kind="success">Projeto criado com as etapas do fluxo da modalidade. A primeira etapa já está em andamento.</Alert>
        </div>
      ) : null}
      <Tabs current={tab} tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: `/projetos/${id}?aba=${t.key}` }))} />
      {tab === "visao" ? <Overview {...ctx} /> : null}
      {tab === "tramitacao" ? <Workflow {...ctx} /> : null}
      {tab === "disciplinas" ? <Disciplines {...ctx} /> : null}
      {tab === "tarefas" ? <Tasks {...ctx} /> : null}
    </>
  );
}
