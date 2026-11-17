import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BASE,
  bodyText,
  clickButton,
  clickLink,
  DESKTOP,
  login,
  MOBILE,
  overflow,
  resetE2eDb,
  selectByText,
  setFields,
  SHOTS,
  stat,
  testPool,
  waitPath,
  waitText,
} from "./helpers";

const ADMIN = { name: "Matheus Administrador", email: "admin@e2e.local", password: "SenhaAdmin12345" };
const OPER = { name: "Olivia Operacional", email: "operacional@e2e.local", password: "SenhaOper12345" };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba" }).format(new Date());

let browser: Browser;
let admin: Page;
let oper: Page;
let projectUrl = "";
let hiddenProjectId = "";

beforeAll(async () => {
  await resetE2eDb();
  // Usuários criados pelas mesmas regras de negócio da aplicação, direto no banco de testes.
  const { installPrimaryAdmin, createUser } = await import("@/modules/users/service");
  const { closeDb } = await import("@/db");
  const a = await installPrimaryAdmin({ token: "token-de-instalacao-de-teste", ...ADMIN });
  await createUser({ id: a.id, role: a.role }, { name: OPER.name, email: OPER.email, role: "OPERACIONAL", password: OPER.password });
  await closeDb();
  const pool = testPool();
  await pool.query("update users set must_change_password = false");
  await pool.end();

  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--no-proxy-server"] });
  admin = await (await browser.createBrowserContext()).newPage();
  oper = await (await browser.createBrowserContext()).newPage();
  for (const p of [admin, oper]) {
    await p.setViewport(DESKTOP);
    p.on("dialog", (d) => void d.accept());
  }
  await login(admin, ADMIN.email, ADMIN.password);
  await login(oper, OPER.email, OPER.password);
});

afterAll(async () => {
  await browser?.close();
});

describe("SIGEP — módulos de gestão no navegador, do cliente à tramitação", () => {
  it("cliente: recusa CNPJ inválido mantendo o formulário e cadastra com o CNPJ correto", async () => {
    await admin.goto(`${BASE}/clientes/novo`);
    await setFields(admin, { name: "Construtora Horizonte Ltda", document: "11.222.333/0001-82", city: "Cuiabá", state: "MT" });
    await clickButton(admin, "Salvar cliente");
    await waitText(admin, "CNPJ inválido");
    expect(await admin.$eval('main [name="name"]', (el) => (el as HTMLInputElement).value)).toBe("Construtora Horizonte Ltda");
    await setFields(admin, { document: "11.222.333/0001-81" });
    await clickButton(admin, "Salvar cliente");
    await waitPath(admin, /^\/clientes\/[0-9a-f-]{36}$/);
    await waitText(admin, "Cliente cadastrado.");
    await admin.goto(`${BASE}/clientes?q=horizonte`);
    expect(await bodyText(admin)).toContain("11.222.333/0001-81");
  });

  it("proposta: rascunho numerado, enviada e aceita", async () => {
    await admin.goto(`${BASE}/propostas/nova`);
    await selectByText(admin, "clientId", "Horizonte");
    await selectByText(admin, "serviceTypeId", "Projeto de arquitetura");
    await setFields(admin, { title: "Projeto residencial Horizonte", value: "valor errado" });
    await clickButton(admin, "Salvar rascunho");
    await waitText(admin, "Valor inválido");
    await setFields(admin, { value: "45.000,00" });
    await clickButton(admin, "Salvar rascunho");
    await waitPath(admin, /^\/propostas\/[0-9a-f-]{36}$/);
    await waitText(admin, `Proposta PROP-${today.slice(0, 4)}-001`);
    await clickButton(admin, "Marcar como enviada");
    await waitText(admin, "Registrar aceite do cliente");
    await clickButton(admin, "Registrar aceite do cliente");
    await waitText(admin, "Gerar contrato desta proposta");
    expect(await bodyText(admin)).toContain("Aceita");
  });

  it("contrato: nasce preenchido pela proposta, só fica vigente com assinatura e início", async () => {
    await clickLink(admin, "Gerar contrato desta proposta");
    await waitPath(admin, "/contratos/novo");
    await admin.waitForSelector('main [name="title"]');
    expect(await admin.$eval('main [name="title"]', (el) => (el as HTMLInputElement).value)).toBe("Projeto residencial Horizonte");
    expect(await admin.$eval('main [name="value"]', (el) => (el as HTMLInputElement).value)).toBe("45.000,00");
    await clickButton(admin, "Salvar rascunho");
    await waitPath(admin, /^\/contratos\/[0-9a-f-]{36}$/);
    await clickButton(admin, "Tornar vigente");
    await waitText(admin, "Informe a data de assinatura e o início da vigência");
    await setFields(admin, { signedAt: today, startDate: today });
    await clickButton(admin, "Salvar alterações");
    await waitText(admin, "Contrato atualizado.");
    await clickButton(admin, "Tornar vigente");
    await waitText(admin, "Encerrar contrato");
    expect(await bodyText(admin)).toContain("Vigente");
  });

  it("projeto: criado a partir do contrato, com as 14 etapas e o operacional como responsável", async () => {
    await clickLink(admin, "Novo projeto neste contrato");
    await waitPath(admin, "/projetos/novo");
    await selectByText(admin, "serviceTypeId", "PPCIP");
    await selectByText(admin, "responsibleId", OPER.name);
    await clickButton(admin, "Criar projeto");
    await waitText(admin, "ainda não tem etapas definidas");
    await selectByText(admin, "serviceTypeId", "Projeto de arquitetura");
    await clickButton(admin, "Criar projeto");
    await waitPath(admin, /^\/projetos\/[0-9a-f-]{36}$/);
    await waitText(admin, `${today.slice(0, 4)}-001 · Projeto residencial Horizonte`);
    projectUrl = admin.url().split("?")[0];
    await admin.goto(`${projectUrl}?aba=tramitacao`);
    await waitText(admin, "Etapa atual: 1. Proposta comercial");
    expect(await admin.$$eval('[data-testid^="stage-"]', (els) => els.length)).toBe(14);
    await admin.screenshot({ path: `${SHOTS}/10-projeto-tramitacao-desktop.png`, fullPage: true });
  });

  it("tramitação: avança com despacho, registra histórico e muda a situação para aguardando cliente", async () => {
    await setFields(admin, { note: "Proposta aprovada pelo cliente" });
    await clickButton(admin, "Tramitar para a próxima etapa");
    await waitText(admin, 'Projeto tramitado para a etapa "Contrato"');
    await waitText(admin, "Etapa atual: 2. Contrato");
    expect(await bodyText(admin)).toContain("“Proposta aprovada pelo cliente”");
    await selectByText(admin, "status", "Aguardando cliente");
    await clickButton(admin, "Atualizar situação");
    await waitText(admin, "Situação: Aguardando cliente");
    await admin.goto(`${BASE}/tramitacao?situacao=AGUARDANDO_CLIENTE`);
    expect(await bodyText(admin)).toContain("Projeto residencial Horizonte");
    await admin.goto(`${BASE}/tramitacao?situacao=AGUARDANDO_ORGAO`);
    expect(await bodyText(admin)).toContain("Nenhum projeto ativo nesta situação.");
  });

  it("tarefa em aberto na etapa atual impede a tramitação", async () => {
    await admin.goto(`${projectUrl}?aba=tarefas`);
    await clickLink(admin, "Nova tarefa");
    await waitPath(admin, "/tarefas/nova");
    await setFields(admin, { title: "Coletar assinatura do contrato", dueDate: today });
    await selectByText(admin, "assigneeId", OPER.name);
    await selectByText(admin, "priority", "Alta");
    await clickButton(admin, "Criar tarefa");
    await waitPath(admin, /^\/tarefas\/[0-9a-f-]{36}$/);
    await waitText(admin, "Tarefa criada.");
    await admin.goto(`${projectUrl}?aba=tramitacao`);
    await clickButton(admin, "Tramitar para a próxima etapa");
    await waitText(admin, "Há 1 tarefa(s) em aberto na etapa");
    expect(await bodyText(admin)).toContain("Etapa atual: 2. Contrato");
  });

  it("dashboard do administrador mostra os indicadores reais do banco", async () => {
    await admin.goto(`${BASE}/`);
    expect(await stat(admin, "Projetos ativos")).toBe("1");
    expect(await stat(admin, "Aguardando cliente")).toBe("1");
    expect(await stat(admin, "Aguardando órgãos")).toBe("0");
    expect(await stat(admin, "Tarefas pendentes")).toBe("1");
    expect(await stat(admin, "Minhas tarefas")).toBe("0");
    expect(await stat(admin, "Entregas da semana")).toBe("1");
    expect(await stat(admin, "Contratos vigentes")).toBe("1");
    expect(await stat(admin, "Receita contratada")).toBe("R$ 45.000,00");
    await admin.screenshot({ path: `${SHOTS}/11-dashboard-gestao-admin-desktop.png`, fullPage: true });
  });

  it("operacional: vê só o projeto em que é responsável, sem valores de contrato, e não cria cadastros", async () => {
    // Segundo projeto, sem o operacional na equipe.
    await admin.goto(`${BASE}/projetos/novo`);
    await setFields(admin, { name: "Projeto reservado da diretoria" });
    await selectByText(admin, "clientId", "Horizonte");
    await selectByText(admin, "serviceTypeId", "Projeto de arquitetura");
    await clickButton(admin, "Criar projeto");
    await waitPath(admin, /^\/projetos\/[0-9a-f-]{36}$/);
    hiddenProjectId = admin.url().split("?")[0].split("/").pop()!;

    await oper.goto(`${BASE}/projetos`);
    const list = await bodyText(oper);
    expect(list).toContain("Projeto residencial Horizonte");
    expect(list).not.toContain("Projeto reservado da diretoria");
    expect(list).not.toContain("Novo projeto");
    const r = await oper.goto(`${BASE}/projetos/${hiddenProjectId}`);
    expect(r?.status()).toBe(404);

    await oper.goto(`${BASE}/contratos`);
    const contracts = await bodyText(oper);
    expect(contracts).toContain(`CT-${today.slice(0, 4)}-001`);
    expect(contracts).not.toContain("45.000,00");
    expect(contracts).not.toContain("Novo contrato");
    await oper.goto(`${BASE}/clientes/novo`);
    await waitPath(oper, "/acesso-negado");

    await oper.goto(`${BASE}/`);
    expect(await stat(oper, "Projetos ativos")).toBe("1");
    expect(await stat(oper, "Minhas tarefas")).toBe("1");
    expect(await bodyText(oper)).not.toContain("Receita contratada");
  });

  it("operacional: conclui a tarefa e tramita o projeto; a devolução não aparece para ele", async () => {
    await oper.goto(`${BASE}/tarefas?escopo=minhas`);
    await clickLink(oper, "Coletar assinatura do contrato");
    await waitPath(oper, /^\/tarefas\/[0-9a-f-]{36}$/);
    await clickButton(oper, "Concluir tarefa");
    await waitText(oper, "Reabrir tarefa");
    await oper.goto(`${projectUrl}?aba=tramitacao`);
    expect(await bodyText(oper)).not.toContain("Devolver à etapa anterior");
    await clickButton(oper, "Tramitar para a próxima etapa");
    await waitText(oper, "Etapa atual: 3. Levantamento");
    await oper.goto(`${projectUrl}?aba=visao`);
    const overview = await bodyText(oper);
    expect(overview).not.toContain("Autorizar outro usuário");
    expect(overview).not.toContain("Cancelar projeto");
    expect(overview).toContain("Pausar projeto");
  });

  it("administrador devolve a etapa com justificativa e a auditoria registra a cadeia de operações", async () => {
    await admin.goto(`${projectUrl}?aba=tramitacao`);
    await admin.waitForSelector("#return-note");
    await admin.$eval("#return-note", (el) => ((el as HTMLTextAreaElement).value = "Contrato sem reconhecimento de firma"));
    await clickButton(admin, "Devolver à etapa anterior");
    await waitText(admin, "Etapa atual: 2. Contrato");
    expect(await bodyText(admin)).toContain("Devolução à etapa anterior: Levantamento → Contrato");
    await admin.goto(`${BASE}/auditoria`);
    const audit = await bodyText(admin);
    for (const a of ["TRAMITACAO_DEVOLUCAO", "TRAMITACAO_AVANCO", "TAREFA_SITUACAO_ALTERADA", "PROJETO_CRIADO", "TAREFA_CRIADA"]) expect(audit).toContain(a);
  });

  it("celular: as telas de gestão cabem na largura", async () => {
    await oper.setViewport(MOBILE);
    for (const p of ["/clientes", "/propostas", "/contratos", "/projetos", "/tramitacao", "/disciplinas", "/tarefas", `${projectUrl.replace(BASE, "")}?aba=tramitacao`, `${projectUrl.replace(BASE, "")}?aba=visao`]) {
      await oper.goto(BASE + p);
      expect(await overflow(oper), p).toBeLessThanOrEqual(0);
    }
    await oper.goto(`${projectUrl}?aba=tramitacao`);
    await oper.screenshot({ path: `${SHOTS}/12-projeto-tramitacao-celular.png` });
    await oper.goto(`${BASE}/`);
    await oper.screenshot({ path: `${SHOTS}/13-dashboard-operacional-celular.png`, fullPage: true });
    await oper.setViewport(DESKTOP);
  });
});
