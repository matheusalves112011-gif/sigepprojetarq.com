import { sql } from "drizzle-orm";
import {
  Activity,
  AlarmClock,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  FileSignature,
  Hourglass,
  KeyRound,
  Landmark,
  PauseCircle,
  ShieldCheck,
  UserCheck,
  UserX,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getDb } from "@/db";
import { formatDateTime } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import { can } from "@/lib/rbac/can";
import { ACTION_LABELS, MODULES, ROLE_LABELS } from "@/lib/rbac/modules";
import { requirePermission } from "@/lib/session";
import { countAuditLastHours, listAudit } from "@/modules/audit/service";
import { dashboardStats } from "@/modules/dashboard/service";
import { userStats } from "@/modules/users/service";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, icon: Icon, hint, href, small }: { label: string; value: number | string; icon: typeof Activity; hint?: string; href?: string; small?: boolean }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <Icon className="h-5 w-5 shrink-0 text-brand-500" aria-hidden />
      </div>
      <p className={`mt-3 font-semibold tracking-tight text-slate-900 ${small ? "text-xl" : "text-3xl"}`} data-testid={`stat-${label}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </>
  );
  const cls = "block rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-brand-300`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

async function migrationInfo() {
  const result = await getDb().execute<{ n: number; ultima: string | null }>(
    sql`select count(*)::int as n, to_timestamp(max(created_at) / 1000)::text as ultima from drizzle.__drizzle_migrations`,
  );
  return result.rows[0];
}

export default async function DashboardPage() {
  const { user, grants } = await requirePermission("DASHBOARD", "VIEW");
  const isAdmin = user.role === "ADMIN_PRINCIPAL";

  const access = MODULES.filter((m) => can(user.role, grants, m.key, "VIEW")).map((m) => ({
    key: m.key,
    label: m.label,
    available: "href" in m,
    phase: m.phase,
    actions: m.actions.filter((a) => can(user.role, grants, m.key, a)),
  }));

  const stats = await dashboardStats(user, grants);

  const admin = isAdmin
    ? await Promise.all([
        userStats(),
        countAuditLastHours(7 * 24),
        countAuditLastHours(24, "LOGIN_FALHA"),
        listAudit({ page: 1 }),
        migrationInfo(),
      ])
    : null;

  return (
    <>
      <PageHeader title={`Olá, ${user.name.split(" ")[0]}`} description={`Perfil: ${ROLE_LABELS[user.role]}. Todos os números desta tela vêm do banco de dados.`} />

      {stats.projects ? (
        <section aria-label="Indicadores de projetos">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-600 uppercase">
            Projetos {isAdmin ? "" : "a que você tem acesso"}
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <Stat label="Projetos ativos" value={stats.projects.ativos} icon={Briefcase} href="/projetos?situacao=ATIVO" />
            <Stat label="Projetos atrasados" value={stats.projects.atrasados} icon={AlarmClock} href="/tramitacao" />
            <Stat label="Aguardando cliente" value={stats.projects.aguardandoCliente} icon={Hourglass} href="/tramitacao?situacao=AGUARDANDO_CLIENTE" />
            <Stat label="Aguardando órgãos" value={stats.projects.aguardandoOrgao} icon={Landmark} href="/tramitacao?situacao=AGUARDANDO_ORGAO" />
            <Stat label="Projetos concluídos" value={stats.projects.concluidos} icon={CheckCircle2} href="/projetos?situacao=CONCLUIDO" />
            <Stat label="Projetos pausados" value={stats.projects.pausados} icon={PauseCircle} href="/projetos?situacao=PAUSADO" />
          </div>
        </section>
      ) : null}

      {stats.tasks || stats.contracts ? (
        <section className="mt-6" aria-label="Indicadores de tarefas e contratos">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-600 uppercase">Tarefas, prazos e contratos</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {stats.tasks ? (
              <>
                <Stat label="Tarefas pendentes" value={stats.tasks.pendentes} icon={ClipboardList} href="/tarefas" />
                <Stat label="Minhas tarefas" value={stats.tasks.minhas} icon={UserCheck} href="/tarefas?escopo=minhas" />
                <Stat label="Tarefas atrasadas" value={stats.tasks.atrasadas} icon={AlarmClock} href="/tarefas?situacao=ATRASADAS" />
                <Stat
                  label="Entregas da semana"
                  value={stats.tasks.daSemana + (stats.projects?.etapasDaSemana ?? 0)}
                  icon={CalendarDays}
                  hint="Tarefas e etapas com prazo nos próximos 7 dias"
                />
              </>
            ) : null}
            {stats.contracts ? <Stat label="Contratos vigentes" value={stats.contracts.vigentes} icon={FileSignature} href="/contratos?situacao=VIGENTE" /> : null}
            {stats.contracts?.receitaContratada != null ? (
              <Stat label="Receita contratada" value={formatBRL(stats.contracts.receitaContratada)} icon={Wallet} hint="Soma dos contratos vigentes" small />
            ) : null}
          </div>
        </section>
      ) : null}

      {admin ? (
        <>
          <h2 className="mt-6 mb-3 text-sm font-semibold tracking-wide text-slate-600 uppercase">Acesso e segurança</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Usuários ativos" value={admin[0].ativos} icon={UserCheck} />
            <Stat label="Usuários bloqueados" value={admin[0].bloqueados} icon={UserX} />
            <Stat label="Sessões abertas" value={admin[0].sessoesAtivas} icon={KeyRound} hint="Sessões não expiradas, incluindo a sua" />
            <Stat label="Eventos de auditoria" value={admin[1]} icon={ShieldCheck} hint={`Últimos 7 dias · ${admin[2]} falha(s) de login em 24 h`} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card title="Atividade recente" description="Últimos registros da auditoria" className="xl:col-span-2">
              {admin[3].rows.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum registro ainda.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {admin[3].rows.slice(0, 8).map((row) => (
                    <li key={row.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm text-slate-800">
                        <span className="font-mono text-xs font-semibold text-brand-700">{row.action}</span>
                        <span className="text-slate-500"> · {row.userName ?? row.entityId ?? "sistema"}</span>
                      </span>
                      <span className="text-xs whitespace-nowrap text-slate-500">{formatDateTime(row.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/auditoria" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
                Ver auditoria completa
              </Link>
            </Card>

            <Card title="Situação do sistema">
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-600">
                    <Database className="h-4 w-4" aria-hidden /> Banco de dados
                  </dt>
                  <dd>
                    <Badge kind="success">Conectado</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-600">Migrações aplicadas</dt>
                  <dd className="font-medium text-slate-900">{admin[4].n}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-600">OneDrive</dt>
                  <dd>
                    <Badge kind="neutral">Não configurado · Fase 4</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-600">Backup automático</dt>
                  <dd>
                    <Badge kind="neutral">Não configurado · Fase 5</Badge>
                  </dd>
                </div>
              </dl>
            </Card>
          </div>
        </>
      ) : null}

      <Card title="Receita recebida e valores pendentes" description="Parcelas, recebimentos e inadimplência" className="mt-6">
        <p className="text-sm text-slate-600">
          Estes indicadores dependem do módulo Financeiro (Fase 4). Nenhum valor fictício é mostrado no lugar.
        </p>
      </Card>

      <Card title="Seus acessos" description="O que o seu perfil pode fazer em cada módulo" className="mt-6">
        <ul className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
          {access.map((m) => (
            <li key={m.key} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <span className="text-sm font-medium text-slate-800">
                {m.label}
                {!m.available ? <span className="ml-2 text-xs font-normal text-slate-400">Fase {m.phase}</span> : null}
              </span>
              <span className="text-right text-xs text-slate-500">{m.actions.map((a) => ACTION_LABELS[a]).join(", ")}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
