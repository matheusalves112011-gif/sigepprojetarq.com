import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, getPool } from "@/db";
import { auditLogs, projectStages, serviceTypes, workflowTemplates } from "@/db/schema";
import { addDays, todayISO } from "@/lib/format";
import { DEFAULT_GRANTS } from "@/lib/rbac/can";
import { updateRolePermissions } from "@/lib/rbac/service";
import { createClient, deleteClient, getClient, listClients, restoreClient, updateClient } from "@/modules/clients/service";
import { createContract, deleteContract, getContract, listContracts, setContractStatus, updateContract } from "@/modules/contracts/service";
import { dashboardStats } from "@/modules/dashboard/service";
import {
  addProjectDiscipline,
  createDiscipline,
  deleteDiscipline,
  listDisciplines,
  listProjectDisciplines,
  setDisciplineActive,
  updateProjectDiscipline,
} from "@/modules/disciplines/service";
import {
  addMember,
  createProject,
  getProject,
  listAssignableUsers,
  listProjects,
  removeMember,
  setProjectStatus,
  updateProject,
} from "@/modules/projects/service";
import { createProposal, deleteProposal, getProposal, listProposals, setProposalStatus, updateProposal } from "@/modules/proposals/service";
import { createTask, deleteTask, getTask, listTasks, setTaskStatus, updateTask } from "@/modules/tasks/service";
import { createUser, setUserStatus } from "@/modules/users/service";
import {
  advanceStage,
  listStages,
  listTemplates,
  listTransitions,
  returnStage,
  setCurrentStageStatus,
  setStageApplicable,
  updateStage,
  updateTemplateStages,
} from "@/modules/workflow/service";
import { installAdmin, resetDb } from "./helpers";

type Actor = { id: string; role: "ADMIN_PRINCIPAL" | "OPERACIONAL" | "CONSULTA" };
let admin: Actor;
let oper: Actor;
let oper2: Actor;
let cons: Actor;
let stdType: string;
let ppcipType: string;

const today = todayISO();
const CLIENT = { type: "PJ", name: "Construtora Horizonte Ltda", document: "11.222.333/0001-81", email: "contato@horizonte.test", state: "mt" };
const audits = async (action: string) => (await getDb().select({ n: count() }).from(auditLogs).where(eq(auditLogs.action, action)))[0].n;
const rej = (code: string) => ({ code });

beforeEach(async () => {
  await resetDb();
  const a = await installAdmin();
  admin = { id: a.id, role: a.role };
  const mk = async (name: string, email: string, role: string) => {
    const u = await createUser(admin, { name, email, role, password: "Provisoria123" });
    return { id: u.id, role: u.role } as Actor;
  };
  oper = await mk("Olivia Operacional", "oper@teste.local", "OPERACIONAL");
  oper2 = await mk("Otavio Operacional", "oper2@teste.local", "OPERACIONAL");
  cons = await mk("Carla Consulta", "cons@teste.local", "CONSULTA");
  const types = await getDb().select().from(serviceTypes);
  stdType = types.find((t) => t.name === "Projeto de arquitetura e engenharia")!.id;
  ppcipType = types.find((t) => t.name === "PPCIP")!.id;
});

const newClient = () => createClient(admin, CLIENT);
const proposalInput = (clientId: string, extra = {}) => ({ clientId, serviceTypeId: stdType, title: "Projeto residencial", value: "45.000,00", validUntil: addDays(today, 30), ...extra });
const projectInput = (clientId: string, extra = {}) => ({ name: "Residência Horizonte", clientId, serviceTypeId: stdType, startDate: today, responsibleId: oper.id, ...extra });

describe("clientes", () => {
  it("cria com documento normalizado, UF em maiúsculas e auditoria", async () => {
    const c = await newClient();
    expect(c).toMatchObject({ document: "11222333000181", state: "MT", type: "PJ" });
    expect(await audits("CLIENTE_CRIADO")).toBe(1);
    expect(await listClients(admin, { q: "horizonte" })).toHaveLength(1);
    expect(await listClients(admin, { q: "11.222.333" })).toHaveLength(1);
    expect(await listClients(admin, { q: "inexistente" })).toHaveLength(0);
  });

  it("recusa documento inválido, tipo incompatível, duplicado e nome curto", async () => {
    await expect(createClient(admin, { ...CLIENT, document: "11.222.333/0001-82" })).rejects.toMatchObject(rej("INVALID"));
    await expect(createClient(admin, { ...CLIENT, type: "PF" })).rejects.toMatchObject(rej("INVALID"));
    await expect(createClient(admin, { ...CLIENT, name: "ab" })).rejects.toMatchObject(rej("INVALID"));
    await newClient();
    await expect(createClient(admin, { ...CLIENT, name: "Outra Razão Social" })).rejects.toMatchObject(rej("CONFLICT"));
    expect((await createClient(admin, { type: "PF", name: "Maria Sem Documento" })).document).toBeNull();
    expect((await createClient(admin, { type: "PF", name: "João Sem Documento" })).document).toBeNull();
  });

  it("permissões da matriz: operacional edita mas não cria nem exclui; consulta só vê", async () => {
    const c = await newClient();
    await expect(createClient(oper, { type: "PF", name: "Tentativa Operacional" })).rejects.toMatchObject(rej("FORBIDDEN"));
    const up = await updateClient(oper, c.id, { ...CLIENT, phone: "(65) 99999-0000" });
    expect(up.phone).toBe("(65) 99999-0000");
    await expect(deleteClient(oper, c.id)).rejects.toMatchObject(rej("FORBIDDEN"));
    await expect(updateClient(cons, c.id, CLIENT)).rejects.toMatchObject(rej("FORBIDDEN"));
    expect(await getClient(cons, c.id)).not.toBeNull();
  });

  it("exclusão lógica só sem vínculos; restauração é do administrador", async () => {
    const c = await newClient();
    await createProposal(admin, proposalInput(c.id));
    await expect(deleteClient(admin, c.id)).rejects.toMatchObject(rej("CONFLICT"));

    const livre = await createClient(admin, { type: "PF", name: "Cliente Sem Vínculo", document: "529.982.247-25" });
    await deleteClient(admin, livre.id);
    expect(await listClients(admin)).toHaveLength(1);
    expect(await getClient(oper, livre.id)).toBeNull();
    expect(await listClients(admin, { deleted: true })).toHaveLength(1);
    expect(await listClients(oper, { deleted: true })).toHaveLength(1); // operacional continua vendo só os ativos
    await expect(createClient(admin, { type: "PF", name: "Mesmo CPF", document: "52998224725" })).rejects.toThrow(/excluído/);
    await expect(restoreClient(oper, livre.id)).rejects.toMatchObject(rej("FORBIDDEN"));
    await restoreClient(admin, livre.id);
    expect(await listClients(admin)).toHaveLength(2);
    const { rows } = await getPool().query("select count(*)::int as n from clients");
    expect(rows[0].n).toBe(2);
  });
});

describe("propostas", () => {
  it("numera em sequência anual e segue o ciclo rascunho → enviada → aceita", async () => {
    const c = await newClient();
    const p1 = await createProposal(admin, proposalInput(c.id));
    const p2 = await createProposal(admin, proposalInput(c.id));
    const year = today.slice(0, 4);
    expect(p1.number).toBe(`PROP-${year}-001`);
    expect(p2.number).toBe(`PROP-${year}-002`);
    expect(p1).toMatchObject({ status: "RASCUNHO", value: "45000.00" });

    await expect(setProposalStatus(admin, p1.id, "ACEITA")).rejects.toMatchObject(rej("CONFLICT"));
    const sent = await setProposalStatus(admin, p1.id, "ENVIADA");
    expect(sent.sentAt).not.toBeNull();
    await expect(updateProposal(admin, p1.id, proposalInput(c.id))).rejects.toMatchObject(rej("CONFLICT"));
    const ok = await setProposalStatus(admin, p1.id, "ACEITA");
    expect(ok).toMatchObject({ status: "ACEITA" });
    await expect(setProposalStatus(admin, p1.id, "RASCUNHO")).rejects.toMatchObject(rej("CONFLICT"));
    expect(await audits("PROPOSTA_SITUACAO_ALTERADA")).toBe(2);
  });

  it("numeração simultânea não repete números", async () => {
    const c = await newClient();
    const made = await Promise.all(Array.from({ length: 8 }, () => createProposal(admin, proposalInput(c.id))));
    expect(new Set(made.map((p) => p.number)).size).toBe(8);
  });

  it("recusa enviar sem valor, enviar e aceitar vencida, valor inválido e cliente excluído", async () => {
    const c = await newClient();
    const zero = await createProposal(admin, proposalInput(c.id, { value: "0" }));
    await expect(setProposalStatus(admin, zero.id, "ENVIADA")).rejects.toMatchObject(rej("INVALID"));
    const vencida = await createProposal(admin, proposalInput(c.id, { validUntil: addDays(today, -1) }));
    await expect(setProposalStatus(admin, vencida.id, "ENVIADA")).rejects.toMatchObject(rej("INVALID"));
    await expect(createProposal(admin, proposalInput(c.id, { value: "abc" }))).rejects.toMatchObject(rej("INVALID"));
    await expect(createProposal(admin, proposalInput(c.id, { validUntil: "2026-02-31" }))).rejects.toMatchObject(rej("INVALID"));

    const p = await createProposal(admin, proposalInput(c.id));
    await setProposalStatus(admin, p.id, "ENVIADA");
    await getPool().query("update proposals set valid_until = $1 where id = $2", [addDays(today, -2), p.id]);
    expect((await getProposal(admin, p.id))?.expired).toBe(true);
    await expect(setProposalStatus(admin, p.id, "ACEITA")).rejects.toMatchObject(rej("CONFLICT"));

    const outro = await createClient(admin, { type: "PF", name: "Cliente a Excluir" });
    await deleteClient(admin, outro.id);
    await expect(createProposal(admin, proposalInput(outro.id))).rejects.toMatchObject(rej("INVALID"));
  });

  it("só rascunho é excluído; operacional vê propostas sem os valores", async () => {
    const c = await newClient();
    const p = await createProposal(admin, proposalInput(c.id));
    expect((await listProposals(oper))[0].value).toBeNull();
    expect((await getProposal(oper, p.id))?.value).toBeNull();
    expect((await listProposals(admin))[0].value).toBe("45000.00");
    await expect(listProposals(cons)).rejects.toMatchObject(rej("FORBIDDEN"));
    await expect(createProposal(oper, proposalInput(c.id))).rejects.toMatchObject(rej("FORBIDDEN"));

    await updateRolePermissions(admin, "OPERACIONAL", [...DEFAULT_GRANTS.OPERACIONAL, { module: "FINANCE", action: "VIEW" }]);
    expect((await listProposals(oper))[0].value).toBe("45000.00");

    await setProposalStatus(admin, p.id, "ENVIADA");
    await expect(deleteProposal(admin, p.id)).rejects.toMatchObject(rej("CONFLICT"));
    await setProposalStatus(admin, p.id, "RASCUNHO");
    await deleteProposal(admin, p.id);
    expect(await listProposals(admin)).toHaveLength(0);
  });
});

describe("contratos", () => {
  const accepted = async (clientId: string) => {
    const p = await createProposal(admin, proposalInput(clientId));
    await setProposalStatus(admin, p.id, "ENVIADA");
    return setProposalStatus(admin, p.id, "ACEITA");
  };
  const contractInput = (clientId: string, extra = {}) => ({ clientId, title: "Contrato de projeto residencial", value: "45.000,00", ...extra });

  it("nasce de proposta aceita, uma única vez, do mesmo cliente", async () => {
    const c = await newClient();
    const rascunho = await createProposal(admin, proposalInput(c.id));
    await expect(createContract(admin, contractInput(c.id, { proposalId: rascunho.id }))).rejects.toMatchObject(rej("CONFLICT"));
    const p = await accepted(c.id);
    const outro = await createClient(admin, { type: "PF", name: "Outro Cliente" });
    await expect(createContract(admin, contractInput(outro.id, { proposalId: p.id }))).rejects.toMatchObject(rej("INVALID"));
    const ct = await createContract(admin, contractInput(c.id, { proposalId: p.id }));
    expect(ct.number).toBe(`CT-${today.slice(0, 4)}-001`);
    await expect(createContract(admin, contractInput(c.id, { proposalId: p.id }))).rejects.toMatchObject(rej("CONFLICT"));
    expect((await getProposal(admin, p.id))?.contractNumber).toBe(ct.number);
  });

  it("só fica vigente com assinatura, início e valor; vigência coerente; vigente não é editado nem excluído", async () => {
    const c = await newClient();
    await expect(createContract(admin, contractInput(c.id, { startDate: "2026-12-01", endDate: "2026-11-01" }))).rejects.toMatchObject(rej("INVALID"));
    const ct = await createContract(admin, contractInput(c.id));
    await expect(setContractStatus(admin, ct.id, "VIGENTE")).rejects.toMatchObject(rej("INVALID"));
    await updateContract(admin, ct.id, contractInput(c.id, { signedAt: today, startDate: today, endDate: addDays(today, 365) }));
    const v = await setContractStatus(admin, ct.id, "VIGENTE");
    expect(v.status).toBe("VIGENTE");
    await expect(updateContract(admin, ct.id, contractInput(c.id))).rejects.toMatchObject(rej("CONFLICT"));
    await expect(deleteContract(admin, ct.id)).rejects.toMatchObject(rej("CONFLICT"));
    await expect(setContractStatus(admin, ct.id, "RASCUNHO")).rejects.toMatchObject(rej("CONFLICT"));
  });

  it("não encerra nem cancela com projeto em andamento; projeto não entra em contrato encerrado ou de outro cliente", async () => {
    const c = await newClient();
    const ct = await createContract(admin, contractInput(c.id, { signedAt: today, startDate: today }));
    await setContractStatus(admin, ct.id, "VIGENTE");
    const prj = await createProject(admin, projectInput(c.id, { contractId: ct.id }));
    await expect(setContractStatus(admin, ct.id, "ENCERRADO")).rejects.toMatchObject(rej("CONFLICT"));
    await expect(setContractStatus(admin, ct.id, "CANCELADO")).rejects.toMatchObject(rej("CONFLICT"));
    await setProjectStatus(admin, prj.id, "CANCELADO");
    await setContractStatus(admin, ct.id, "ENCERRADO");
    await expect(createProject(admin, projectInput(c.id, { contractId: ct.id }))).rejects.toMatchObject(rej("CONFLICT"));
    const outro = await createClient(admin, { type: "PF", name: "Outro Cliente" });
    const ct2 = await createContract(admin, contractInput(outro.id));
    await expect(createProject(admin, projectInput(c.id, { contractId: ct2.id }))).rejects.toMatchObject(rej("INVALID"));
  });

  it("operacional vê contratos sem valores e não cria; consulta não acessa", async () => {
    const c = await newClient();
    const ct = await createContract(admin, contractInput(c.id));
    expect((await listContracts(oper))[0].value).toBeNull();
    expect((await getContract(oper, ct.id))?.value).toBeNull();
    await expect(createContract(oper, contractInput(c.id))).rejects.toMatchObject(rej("FORBIDDEN"));
    await expect(listContracts(cons)).rejects.toMatchObject(rej("FORBIDDEN"));
  });
});

describe("projetos e acesso por projeto", () => {
  it("cria com código anual, 14 etapas do fluxo padrão, primeira em andamento e histórico", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    expect(p.code).toBe(`${today.slice(0, 4)}-001`);
    const stages = await listStages(admin, p.id);
    expect(stages).toHaveLength(14);
    expect(stages[0]).toMatchObject({ name: "Proposta comercial", status: "EM_ANDAMENTO" });
    expect(stages.slice(1).every((s) => s.status === "NAO_INICIADA")).toBe(true);
    expect(p.currentStageId).toBe(stages[0].id);
    const [st] = await getDb().select().from(projectStages).where(eq(projectStages.id, stages[5].id));
    expect(st.folderKey).toBe("09 - APROVAÇÕES");
    const hist = await listTransitions(admin, p.id);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ kind: "INICIO", toName: "Proposta comercial" });
    expect(await audits("PROJETO_CRIADO")).toBe(1);
  });

  it("modalidade sem etapas definidas não cria projeto até o administrador configurar o fluxo", async () => {
    const c = await newClient();
    await expect(createProject(admin, projectInput(c.id, { serviceTypeId: ppcipType }))).rejects.toThrow(/ainda não tem etapas/);
    const [tpl] = await getDb().select().from(workflowTemplates).where(eq(workflowTemplates.name, "Fluxo PPCIP"));
    await expect(updateTemplateStages(oper, tpl.id, [{ name: "Vistoria", defaultDays: 5 }])).rejects.toMatchObject(rej("FORBIDDEN"));
    await expect(updateTemplateStages(admin, tpl.id, [{ name: "Vistoria", defaultDays: 5 }, { name: "vistoria", defaultDays: null }])).rejects.toMatchObject(rej("INVALID"));
    await updateTemplateStages(admin, tpl.id, [
      { name: "Vistoria", defaultDays: 5 },
      { name: "Projeto", defaultDays: 10 },
      { name: "Protocolo no Corpo de Bombeiros", defaultDays: null },
      { name: "Entrega", defaultDays: 3 },
    ]);
    const p = await createProject(admin, projectInput(c.id, { serviceTypeId: ppcipType }));
    const stages = await listStages(admin, p.id);
    expect(stages.map((s) => s.name)).toEqual(["Vistoria", "Projeto", "Protocolo no Corpo de Bombeiros", "Entrega"]);
    expect(stages.map((s) => s.dueDate)).toEqual([addDays(today, 5), addDays(today, 15), null, null]);
    expect((await listTemplates(admin)).find((t) => t.id === tpl.id)?.stages).toHaveLength(4);
    expect(await audits("FLUXO_ALTERADO")).toBe(1);
  });

  it("valida prazo, responsável bloqueado e permissão de criação", async () => {
    const c = await newClient();
    await expect(createProject(admin, projectInput(c.id, { dueDate: addDays(today, -1) }))).rejects.toMatchObject(rej("INVALID"));
    await expect(createProject(oper, projectInput(c.id))).rejects.toMatchObject(rej("FORBIDDEN"));
    await setUserStatus(admin, oper2.id, "BLOQUEADO");
    await expect(createProject(admin, projectInput(c.id, { responsibleId: oper2.id }))).rejects.toMatchObject(rej("INVALID"));
  });

  it("usuário só enxerga e altera projetos em que é responsável ou autorizado", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id)); // responsável: oper
    expect(await listProjects(oper)).toHaveLength(1);
    expect(await listProjects(oper2)).toHaveLength(0);
    expect(await listProjects(cons)).toHaveLength(0);
    expect(await getProject(oper2, p.id)).toBeNull();
    await expect(updateProject(oper2, p.id, { name: "Invasão", responsibleId: oper2.id })).rejects.toMatchObject(rej("NOT_FOUND"));
    await expect(listStages(oper2, p.id)).rejects.toMatchObject(rej("NOT_FOUND"));
    await expect(advanceStage(oper2, p.id)).rejects.toMatchObject(rej("NOT_FOUND"));
    await expect(createTask(oper2, { projectId: p.id, title: "Tarefa indevida", priority: "MEDIA" })).rejects.toMatchObject(rej("NOT_FOUND"));

    await expect(addMember(oper, p.id, oper2.id)).rejects.toMatchObject(rej("FORBIDDEN"));
    await addMember(admin, p.id, oper2.id);
    await addMember(admin, p.id, cons.id);
    expect(await listProjects(oper2)).toHaveLength(1);
    expect(await getProject(cons, p.id)).not.toBeNull();
    await expect(updateProject(cons, p.id, { name: "Consulta não edita", responsibleId: oper.id })).rejects.toMatchObject(rej("FORBIDDEN"));
    expect((await listAssignableUsers(admin, p.id)).map((u) => u.id).sort()).toEqual([admin.id, oper.id, oper2.id, cons.id].sort());

    await expect(removeMember(admin, p.id, oper.id)).rejects.toMatchObject(rej("CONFLICT"));
    await removeMember(admin, p.id, oper2.id);
    expect(await listProjects(oper2)).toHaveLength(0);
    expect(await audits("PROJETO_MEMBRO_AUTORIZADO")).toBe(2);
  });

  it("troca de responsável autoriza o novo; pausar é de quem edita e cancelar exige permissão de exclusão", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    await updateProject(oper, p.id, { name: "Residência Horizonte II", responsibleId: oper2.id });
    expect(await listProjects(oper2)).toHaveLength(1);
    expect(await listProjects(oper)).toHaveLength(1); // continua autorizado como membro
    await expect(setProjectStatus(oper, p.id, "CANCELADO")).rejects.toMatchObject(rej("FORBIDDEN"));
    expect((await setProjectStatus(oper, p.id, "PAUSADO")).status).toBe("PAUSADO");
    await expect(advanceStage(oper, p.id)).rejects.toMatchObject(rej("CONFLICT"));
    await setProjectStatus(oper, p.id, "ATIVO");
    await setProjectStatus(admin, p.id, "CANCELADO");
    await expect(setProjectStatus(admin, p.id, "ATIVO")).rejects.toMatchObject(rej("CONFLICT"));
    await expect(updateProject(admin, p.id, { name: "Depois de cancelado", responsibleId: oper.id })).rejects.toMatchObject(rej("CONFLICT"));
  });
});

describe("tramitação", () => {
  it("avança etapa a etapa, registra histórico e conclui o projeto na última", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    const r = await advanceStage(oper, p.id, "Proposta aprovada pelo cliente");
    expect(r).toEqual({ completed: false, currentStageName: "Contrato" });
    let stages = await listStages(admin, p.id);
    expect(stages[0]).toMatchObject({ status: "CONCLUIDA" });
    expect(stages[0].completedAt).not.toBeNull();
    expect(stages[1]).toMatchObject({ status: "EM_ANDAMENTO" });

    for (let i = 0; i < 12; i++) await advanceStage(oper, p.id);
    const last = await advanceStage(oper, p.id, "Arquivado");
    expect(last.completed).toBe(true);
    stages = await listStages(admin, p.id);
    expect(stages.every((s) => s.status === "CONCLUIDA")).toBe(true);
    const done = await getProject(admin, p.id);
    expect(done?.project.status).toBe("CONCLUIDO");
    expect(done?.project.completedAt).not.toBeNull();
    const hist = await listTransitions(admin, p.id);
    expect(hist).toHaveLength(15);
    expect(hist[0]).toMatchObject({ kind: "CONCLUSAO", note: "Arquivado" });
    await expect(advanceStage(oper, p.id)).rejects.toMatchObject(rej("CONFLICT"));
  });

  it("situação aguardando cliente/órgão alimenta os indicadores; consulta não tramita", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    await addMember(admin, p.id, cons.id);
    await expect(setCurrentStageStatus(cons, p.id, "AGUARDANDO_CLIENTE")).rejects.toMatchObject(rej("FORBIDDEN"));
    await expect(advanceStage(cons, p.id)).rejects.toMatchObject(rej("FORBIDDEN"));
    await expect(setCurrentStageStatus(oper, p.id, "CONCLUIDA")).rejects.toMatchObject(rej("INVALID"));
    await setCurrentStageStatus(oper, p.id, "AGUARDANDO_CLIENTE", "Aguardando documentos do terreno");
    expect((await listProjects(admin, { stageStatus: "AGUARDANDO_CLIENTE" }))).toHaveLength(1);
    expect((await listProjects(admin, { stageStatus: "AGUARDANDO_ORGAO" }))).toHaveLength(0);
    const hist = await listTransitions(admin, p.id);
    expect(hist[0]).toMatchObject({ kind: "SITUACAO", fromStatus: "EM_ANDAMENTO", toStatus: "AGUARDANDO_CLIENTE" });
  });

  it("devolução exige permissão de aprovar e justificativa, e reabre a etapa anterior", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    await expect(returnStage(admin, p.id, "Não há etapa anterior")).rejects.toMatchObject(rej("CONFLICT"));
    await advanceStage(oper, p.id);
    await expect(returnStage(oper, p.id, "Faltou assinatura")).rejects.toMatchObject(rej("FORBIDDEN"));
    await expect(returnStage(admin, p.id, "")).rejects.toMatchObject(rej("INVALID"));
    const r = await returnStage(admin, p.id, "Faltou assinatura do cliente");
    expect(r.currentStageName).toBe("Proposta comercial");
    const stages = await listStages(admin, p.id);
    expect(stages[0]).toMatchObject({ status: "EM_ANDAMENTO", completedAt: null });
    expect(stages[1]).toMatchObject({ status: "NAO_INICIADA", startedAt: null });
    expect((await listTransitions(admin, p.id))[0]).toMatchObject({ kind: "DEVOLUCAO", note: "Faltou assinatura do cliente" });
  });

  it("etapa marcada como não aplicável é pulada; etapa em curso ou concluída não pode ser marcada", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    const stages = await listStages(admin, p.id);
    await expect(setStageApplicable(oper, stages[1].id, false)).rejects.toMatchObject(rej("FORBIDDEN"));
    await expect(setStageApplicable(admin, stages[0].id, false)).rejects.toMatchObject(rej("CONFLICT"));
    await setStageApplicable(admin, stages[1].id, false);
    const r = await advanceStage(oper, p.id);
    expect(r.currentStageName).toBe("Levantamento");
    await setStageApplicable(admin, stages[1].id, true);
    expect((await listStages(admin, p.id))[1].status).toBe("NAO_INICIADA");
  });

  it("responsável e prazo da etapa: só usuário com acesso ao projeto e prazo coerente", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    const [s1] = await listStages(admin, p.id);
    await expect(updateStage(oper, s1.id, { responsibleId: oper2.id, dueDate: null })).rejects.toThrow(/não tem acesso/);
    await expect(updateStage(oper, s1.id, { responsibleId: oper.id, dueDate: addDays(today, -3) })).rejects.toMatchObject(rej("INVALID"));
    await updateStage(oper, s1.id, { responsibleId: oper.id, dueDate: addDays(today, 7) });
    expect((await listStages(admin, p.id))[0]).toMatchObject({ responsibleId: oper.id, dueDate: addDays(today, 7) });
  });

  it("não tramita com tarefa em aberto na etapa atual", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    const [s1] = await listStages(admin, p.id);
    const t = await createTask(oper, { projectId: p.id, stageId: s1.id, title: "Coletar documentos", priority: "ALTA" });
    await expect(advanceStage(oper, p.id)).rejects.toThrow(/1 tarefa\(s\) em aberto/);
    await setTaskStatus(oper, t.id, "CONCLUIDA");
    expect((await advanceStage(oper, p.id)).currentStageName).toBe("Contrato");
  });

  it("o histórico de tramitação não pode ser alterado nem apagado no banco", async () => {
    const c = await newClient();
    await createProject(admin, projectInput(c.id));
    await expect(getPool().query("update stage_transitions set note = 'adulterado'")).rejects.toThrow(/somente insercao/);
    await expect(getPool().query("delete from stage_transitions")).rejects.toThrow(/somente insercao/);
  });
});

describe("disciplinas", () => {
  it("cadastro: cria, recusa nome repetido, desativa e só exclui se nunca usada", async () => {
    expect((await listDisciplines(admin)).map((d) => d.name)).toContain("Arquitetura");
    await expect(createDiscipline(admin, "arquitetura")).rejects.toMatchObject(rej("CONFLICT"));
    await expect(createDiscipline(oper, "Climatização")).rejects.toMatchObject(rej("FORBIDDEN"));
    const d = await createDiscipline(admin, "Climatização");
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    await addProjectDiscipline(oper, p.id, { disciplineId: d.id, responsibleId: oper.id });
    await expect(deleteDiscipline(admin, d.id)).rejects.toMatchObject(rej("CONFLICT"));
    await setDisciplineActive(admin, d.id, false);
    const nova = await createDiscipline(admin, "Paisagismo");
    await deleteDiscipline(admin, nova.id);
    expect((await listDisciplines(admin)).find((x) => x.id === d.id)).toMatchObject({ active: false, projects: 1 });
  });

  it("no projeto: sem repetição, sem disciplina desativada, responsável com acesso, ART registrada", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    const all = await listDisciplines(admin);
    const arq = all.find((d) => d.name === "Arquitetura")!;
    const ele = all.find((d) => d.name === "Elétrica")!;
    const pd = await addProjectDiscipline(oper, p.id, { disciplineId: arq.id });
    await expect(addProjectDiscipline(oper, p.id, { disciplineId: arq.id })).rejects.toMatchObject(rej("CONFLICT"));
    await expect(addProjectDiscipline(oper, p.id, { disciplineId: ele.id, responsibleId: oper2.id })).rejects.toThrow(/não tem acesso/);
    await setDisciplineActive(admin, ele.id, false);
    await expect(addProjectDiscipline(oper, p.id, { disciplineId: ele.id })).rejects.toMatchObject(rej("INVALID"));
    await expect(addProjectDiscipline(oper2, p.id, { disciplineId: ele.id })).rejects.toMatchObject(rej("NOT_FOUND"));
    await updateProjectDiscipline(oper, pd.id, { responsibleId: oper.id, status: "EM_ANDAMENTO", artNumber: "ART 1220260012345" });
    expect((await listProjectDisciplines(admin, p.id))[0]).toMatchObject({ name: "Arquitetura", status: "EM_ANDAMENTO", artNumber: "ART 1220260012345", responsibleName: "Olivia Operacional" });
    await expect(updateProjectDiscipline(oper, pd.id, { status: "INVALIDA" })).rejects.toMatchObject(rej("INVALID"));
  });
});

describe("tarefas", () => {
  it("cria, atribui só a quem tem acesso, conclui e lista por filtro", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    const [s1, s2] = await listStages(admin, p.id);
    await expect(createTask(oper, { projectId: p.id, title: "Medir terreno", priority: "MEDIA", assigneeId: oper2.id })).rejects.toThrow(/não tem acesso/);
    await expect(createTask(oper, { projectId: p.id, title: "x", priority: "MEDIA" })).rejects.toMatchObject(rej("INVALID"));
    await expect(createTask(oper, { projectId: p.id, title: "Prioridade errada", priority: "MAXIMA" })).rejects.toMatchObject(rej("INVALID"));
    const t1 = await createTask(oper, { projectId: p.id, stageId: s2.id, title: "Medir terreno", priority: "ALTA", assigneeId: oper.id, dueDate: addDays(today, -2) });
    const t2 = await createTask(admin, { projectId: p.id, title: "Emitir boleto", priority: "BAIXA", assigneeId: admin.id, dueDate: addDays(today, 3) });
    expect(s1.id).not.toBe(s2.id);

    expect(await listTasks(oper)).toHaveLength(2);
    expect(await listTasks(oper, { mine: true })).toHaveLength(1);
    expect((await listTasks(admin, { late: true })).map((t) => t.id)).toEqual([t1.id]);
    expect((await getTask(oper, t1.id))?.late).toBe(true);
    expect(await listTasks(oper2)).toHaveLength(0);
    expect(await getTask(oper2, t1.id)).toBeNull();
    await expect(setTaskStatus(oper2, t1.id, "CONCLUIDA")).rejects.toMatchObject(rej("NOT_FOUND"));

    const done = await setTaskStatus(oper, t1.id, "CONCLUIDA");
    expect(done.completedAt).not.toBeNull();
    expect((await getTask(oper, t1.id))?.late).toBe(false);
    expect((await setTaskStatus(oper, t1.id, "EM_ANDAMENTO")).completedAt).toBeNull();
    expect(await listTasks(admin, { status: "ABERTAS" })).toHaveLength(2);
    expect(await listTasks(admin, { status: "CONCLUIDA" })).toHaveLength(0);
    await updateTask(oper, t2.id, { title: "Emitir boleto da entrada", priority: "MEDIA", assigneeId: oper.id });
    expect((await getTask(admin, t2.id))?.assigneeName).toBe("Olivia Operacional");
  });

  it("etapa de outro projeto é recusada; consulta não cria; exclusão exige permissão; projeto encerrado trava tarefas", async () => {
    const c = await newClient();
    const p = await createProject(admin, projectInput(c.id));
    const p2 = await createProject(admin, projectInput(c.id, { name: "Segundo projeto" }));
    const [outra] = await listStages(admin, p2.id);
    await expect(createTask(oper, { projectId: p.id, stageId: outra.id, title: "Etapa errada", priority: "MEDIA" })).rejects.toThrow(/não pertence/);
    await addMember(admin, p.id, cons.id);
    await expect(createTask(cons, { projectId: p.id, title: "Consulta não cria", priority: "MEDIA" })).rejects.toMatchObject(rej("FORBIDDEN"));
    expect(await listTasks(cons)).toHaveLength(0);
    const t = await createTask(oper, { projectId: p.id, title: "Tarefa a excluir", priority: "MEDIA" });
    expect(await listTasks(cons)).toHaveLength(1);
    await expect(deleteTask(oper, t.id)).rejects.toMatchObject(rej("FORBIDDEN"));
    await setProjectStatus(admin, p.id, "CANCELADO");
    await expect(setTaskStatus(oper, t.id, "CONCLUIDA")).rejects.toMatchObject(rej("CONFLICT"));
    await expect(createTask(oper, { projectId: p.id, title: "Depois de cancelado", priority: "MEDIA" })).rejects.toMatchObject(rej("CONFLICT"));
    await deleteTask(admin, t.id);
    expect(await audits("TAREFA_EXCLUIDA")).toBe(1);
  });
});

describe("indicadores do painel", () => {
  it("contam dados reais, respeitam o acesso por projeto e escondem valores de quem não vê o financeiro", async () => {
    const c = await newClient();
    const ct = await createContract(admin, { clientId: c.id, title: "Contrato A", value: "45.000,00", signedAt: today, startDate: today });
    await setContractStatus(admin, ct.id, "VIGENTE");
    const ct2 = await createContract(admin, { clientId: c.id, title: "Contrato B", value: "5.000,50", signedAt: today, startDate: today });
    await setContractStatus(admin, ct2.id, "VIGENTE");
    await createContract(admin, { clientId: c.id, title: "Rascunho não conta", value: "999,00" });

    const p1 = await createProject(admin, projectInput(c.id, { contractId: ct.id }));
    const p2 = await createProject(admin, projectInput(c.id, { name: "Atrasado", responsibleId: oper2.id }));
    const p3 = await createProject(admin, projectInput(c.id, { name: "Pausado", responsibleId: oper2.id }));
    await setProjectStatus(admin, p3.id, "PAUSADO");
    await setCurrentStageStatus(admin, p1.id, "AGUARDANDO_ORGAO");
    const [s] = await listStages(admin, p2.id);
    await getPool().query("update project_stages set due_date = $1 where id = $2", [addDays(today, -1), s.id]);
    await createTask(admin, { projectId: p1.id, title: "Tarefa da semana", priority: "MEDIA", assigneeId: oper.id, dueDate: addDays(today, 2) });
    await createTask(admin, { projectId: p2.id, title: "Tarefa atrasada", priority: "MEDIA", dueDate: addDays(today, -5) });

    const grantsOf = async (a: Actor) => (await import("@/lib/rbac/service")).getRoleGrants(a.role);
    const a = await dashboardStats(admin, await grantsOf(admin));
    expect(a.projects).toMatchObject({ ativos: 2, pausados: 1, concluidos: 0, atrasados: 1, aguardandoOrgao: 1, aguardandoCliente: 0 });
    expect(a.tasks).toMatchObject({ pendentes: 2, atrasadas: 1, daSemana: 1, minhas: 0 });
    expect(a.contracts).toEqual({ vigentes: 2, receitaContratada: "50000.50" });

    const o = await dashboardStats(oper, await grantsOf(oper));
    expect(o.projects).toMatchObject({ ativos: 1, pausados: 0, atrasados: 0, aguardandoOrgao: 1 });
    expect(o.tasks).toMatchObject({ pendentes: 1, minhas: 1, atrasadas: 0 });
    expect(o.contracts).toEqual({ vigentes: 2, receitaContratada: null });

    const k = await dashboardStats(cons, await grantsOf(cons));
    expect(k.projects).toMatchObject({ ativos: 0 });
    expect(k.contracts).toBeNull();
  });
});
