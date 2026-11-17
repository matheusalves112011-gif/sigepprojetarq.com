import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Browser, type BrowserContext, type Page } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetE2eDb } from "./helpers";

const BASE = "http://localhost:3100";
const SHOTS = "tests/e2e/screenshots";
const ADMIN = { name: "Matheus Administrador", email: "admin@e2e.local", password: "SenhaAdmin12345" };
const OPER = { name: "Olivia Operacional", email: "operacional@e2e.local", provisional: "Provisoria12345", password: "Definitiva12345" };
const SETUP_TOKEN = "token-de-instalacao-de-teste";

let browser: Browser;
let adminCtx: BrowserContext;
let operCtx: BrowserContext;
let admin: Page;
let oper: Page;

const DESKTOP = { width: 1366, height: 850 };
const MOBILE = { width: 390, height: 844, isMobile: true, hasTouch: true };

async function waitPath(page: Page, pathname: string) {
  await page.waitForFunction((p) => location.pathname === p, { timeout: 20_000 }, pathname);
}
async function waitText(page: Page, text: string) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 20_000 }, text);
}
const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);
async function fill(page: Page, fields: Record<string, string>) {
  for (const [name, value] of Object.entries(fields)) {
    const sel = `[name="${name}"]`;
    await page.waitForSelector(sel);
    await page.$eval(sel, (el) => ((el as HTMLInputElement).value = ""));
    await page.type(sel, value);
  }
}
const submit = (page: Page, nth = 0) => page.evaluate((i) => (document.querySelectorAll('main button[type="submit"]')[i] as HTMLButtonElement).click(), nth);
async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await fill(page, { email, password });
  await submit(page);
}
const head = (p: string) => fetch(BASE + p, { redirect: "manual" });

beforeAll(async () => {
  await resetE2eDb();
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--no-proxy-server"],
  });
  adminCtx = await browser.createBrowserContext();
  operCtx = await browser.createBrowserContext();
  admin = await adminCtx.newPage();
  oper = await operCtx.newPage();
  await admin.setViewport(DESKTOP);
  await oper.setViewport(DESKTOP);
  admin.on("dialog", (d) => void d.accept());
});

afterAll(async () => {
  await browser?.close();
});

describe("SIGEP — fluxo de ponta a ponta no servidor em execução", () => {
  it("servidor responde, com cabeçalhos de segurança e sem revelar a tecnologia", async () => {
    const r = await fetch(`${BASE}/api/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "ok" });
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("strict-transport-security")).toContain("max-age");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });

  it("sem sessão, toda rota protegida redireciona para o login", async () => {
    for (const p of ["/", "/usuarios", "/usuarios/novo", "/permissoes", "/auditoria", "/conta", "/trocar-senha"]) {
      const r = await head(p);
      expect([302, 307], p).toContain(r.status);
      expect(r.headers.get("location"), p).toMatch(/\/login$/);
    }
  });

  it("cookie de sessão forjado não dá acesso", async () => {
    const r = await fetch(`${BASE}/usuarios`, { redirect: "manual", headers: { cookie: "sigep.session_token=forjado.assinatura" } });
    expect([302, 307]).toContain(r.status);
    expect(r.headers.get("location")).toMatch(/\/login$/);
  });

  it("instalação: recusa código errado, cria o administrador com o código certo e deixa de existir", async () => {
    await admin.goto(`${BASE}/login`);
    await waitPath(admin, "/instalacao");
    const dados = { name: ADMIN.name, email: ADMIN.email, password: ADMIN.password, confirm: ADMIN.password };
    await fill(admin, { token: "codigo-errado-0000000", ...dados });
    await submit(admin);
    await waitText(admin, "Código de instalação incorreto.");
    expect(await admin.$eval('[name="name"]', (el) => (el as HTMLInputElement).value)).toBe(ADMIN.name);

    await fill(admin, { token: SETUP_TOKEN });
    await submit(admin);
    await waitPath(admin, "/login");
    await waitText(admin, "Administrador principal criado");
    expect((await head("/instalacao")).status).toBe(404);
  });

  it("login: recusa senha errada; com a senha certa abre o dashboard com dados reais", async () => {
    await login(admin, ADMIN.email, "SenhaErrada99999");
    await waitText(admin, "E-mail ou senha inválidos.");
    await login(admin, ADMIN.email, ADMIN.password);
    await waitPath(admin, "/");
    await waitText(admin, "Olá, Matheus");
    expect(await admin.$eval('[data-testid="stat-Usuários ativos"]', (el) => el.textContent)).toBe("1");
    expect(await admin.$eval('[data-testid="stat-Sessões abertas"]', (el) => el.textContent)).toBe("1");
    const cookie = (await adminCtx.cookies()).find((c) => c.name === "sigep.session_token");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    await admin.screenshot({ path: `${SHOTS}/01-dashboard-admin-desktop.png` });
  });

  it("menu lateral do administrador mostra a área administrativa, os módulos entregues com link e os futuros sem link", async () => {
    const menu = await admin.$eval('[data-testid="sidebar-desktop"]', (el) => (el as HTMLElement).innerText);
    for (const item of ["Dashboard", "Clientes", "Financeiro", "Usuários e permissões", "Auditoria", "Sair"]) expect(menu).toContain(item);
    const links = await admin.$$eval('[data-testid="sidebar-desktop"] nav a', (as) => as.map((a) => a.getAttribute("href")));
    expect(links.sort()).toEqual(["/", "/auditoria", "/clientes", "/contratos", "/disciplinas", "/projetos", "/propostas", "/tarefas", "/tramitacao", "/usuarios"]);
  });

  it("administrador cria usuário operacional; dados inválidos são recusados sem perder o formulário", async () => {
    await admin.goto(`${BASE}/usuarios/novo`);
    await fill(admin, { name: OPER.name, email: OPER.email, password: "somenteletras", confirm: "somenteletras" });
    await submit(admin);
    await waitText(admin, "A senha deve conter ao menos um número");
    expect(await admin.$eval('[name="email"]', (el) => (el as HTMLInputElement).value)).toBe(OPER.email);
    await fill(admin, { password: OPER.provisional, confirm: OPER.provisional });
    await submit(admin);
    await waitPath(admin, "/usuarios");
    await waitText(admin, OPER.email);
    const row = await admin.$eval(`[data-testid="user-row-${OPER.email}"]`, (el) => (el as HTMLElement).innerText);
    expect(row).toContain("Operacional");
    expect(row).toContain("senha provisória");
    await admin.screenshot({ path: `${SHOTS}/02-usuarios-admin-desktop.png` });
  });

  it("administrador concede Financeiro (ver) ao perfil Operacional", async () => {
    await admin.goto(`${BASE}/permissoes`);
    await admin.waitForSelector('input[name="g"][value="FINANCE:VIEW"]');
    await admin.evaluate(() => {
      const form = document.querySelectorAll("main form")[0];
      (form.querySelector('input[value="FINANCE:VIEW"]') as HTMLInputElement).click();
    });
    await submit(admin, 0);
    await waitText(admin, "Permissões do perfil Operacional salvas");
    const consultaEdit = await admin.evaluate(() => {
      const form = document.querySelectorAll("main form")[1];
      return (form.querySelector('input[value="TASKS:EDIT"]') as HTMLInputElement).disabled;
    });
    expect(consultaEdit).toBe(true);
    await admin.screenshot({ path: `${SHOTS}/03-permissoes-admin-desktop.png`, fullPage: true });
  });

  it("auditoria registra instalação, login, criação de usuário e mudança de permissão com antes e depois", async () => {
    await admin.goto(`${BASE}/auditoria`);
    const text = await bodyText(admin);
    for (const a of ["INSTALACAO", "LOGIN_FALHA", "LOGIN", "USUARIO_CRIADO", "PERMISSOES_ALTERADAS"]) expect(text).toContain(a);
    expect(text).not.toContain(OPER.provisional);
    expect(text).not.toContain(ADMIN.password);
    await admin.goto(`${BASE}/auditoria?acao=PERMISSOES`);
    await admin.$eval("details summary", (el) => (el as HTMLElement).click());
    expect(await bodyText(admin)).toContain("FINANCE:VIEW");
  });

  it("operacional: troca obrigatória da senha provisória antes de qualquer tela", async () => {
    await login(oper, OPER.email, OPER.provisional);
    await waitPath(oper, "/trocar-senha");
    await oper.goto(`${BASE}/`);
    await waitPath(oper, "/trocar-senha");
    await fill(oper, { currentPassword: OPER.provisional, newPassword: OPER.password, confirm: OPER.password });
    await submit(oper);
    await waitPath(oper, "/");
    await waitText(oper, "Olá, Olivia");
  });

  it("operacional: sem área administrativa no menu nem nos indicadores; Financeiro aparece após a concessão", async () => {
    const menu = await oper.$eval('[data-testid="sidebar-desktop"]', (el) => (el as HTMLElement).innerText);
    expect(menu).toContain("Financeiro");
    expect(menu).toContain("Tarefas");
    expect(menu).not.toContain("Usuários e permissões");
    expect(menu).not.toContain("Auditoria");
    expect(menu).not.toContain("Configurações");
    const text = await bodyText(oper);
    expect(text).not.toContain("Usuários ativos");
    expect(text).not.toContain("Atividade recente");
    await oper.screenshot({ path: `${SHOTS}/04-dashboard-operacional-desktop.png` });
  });

  it("operacional: acesso direto às rotas administrativas é negado no servidor", async () => {
    const adminUserId = await admin.evaluate(async () => {
      const html = await (await fetch("/usuarios")).text();
      return html.match(/\/usuarios\/([0-9a-f-]{36})/)![1];
    });
    for (const p of ["/usuarios", "/usuarios/novo", `/usuarios/${adminUserId}`, "/permissoes", "/auditoria"]) {
      await oper.goto(BASE + p);
      await waitPath(oper, "/acesso-negado");
    }
    expect(await bodyText(oper)).toContain("Seu perfil não tem permissão");
  });

  it("celular: menu lateral vira menu deslizante e a página não estoura a largura", async () => {
    await oper.setViewport(MOBILE);
    await oper.goto(`${BASE}/`);
    await waitText(oper, "Olá, Olivia");
    expect(await oper.$eval('[data-testid="sidebar-desktop"]', (el) => getComputedStyle(el).display)).toBe("none");
    expect(await oper.$('[data-testid="sidebar-mobile"]')).toBeNull();
    const overflow = await oper.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await oper.screenshot({ path: `${SHOTS}/05-dashboard-operacional-celular.png` });

    await oper.click('button[aria-label="Abrir menu"]');
    await oper.waitForSelector('[data-testid="sidebar-mobile"]');
    await oper.screenshot({ path: `${SHOTS}/06-menu-celular.png` });
    await oper.evaluate(() => (document.querySelector('[data-testid="sidebar-mobile"] a[href="/conta"]') as HTMLElement).click());
    await waitPath(oper, "/conta");
    await oper.waitForFunction(() => !document.querySelector('[data-testid="sidebar-mobile"]'));
    await oper.setViewport(DESKTOP);
  });

  it("celular: telas administrativas cabem na largura (tabela rola dentro do cartão)", async () => {
    await admin.setViewport(MOBILE);
    for (const p of ["/", "/usuarios", "/permissoes", "/auditoria"]) {
      await admin.goto(BASE + p);
      const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, p).toBeLessThanOrEqual(0);
    }
    await admin.goto(`${BASE}/`);
    await admin.screenshot({ path: `${SHOTS}/07-dashboard-admin-celular.png`, fullPage: true });
    await admin.setViewport(DESKTOP);
  });

  it("bloqueio: o usuário é desconectado na hora e não consegue mais entrar", async () => {
    await admin.goto(`${BASE}/usuarios`);
    await admin.evaluate((email) => (document.querySelector(`[data-testid="user-row-${email}"] a`) as HTMLElement).click(), OPER.email);
    await waitText(admin, "Bloquear acesso");
    await admin.evaluate(() => {
      const btn = [...document.querySelectorAll('main button[type="submit"]')].find((b) => b.textContent?.includes("Bloquear usuário"));
      (btn as HTMLButtonElement).click();
    });
    await waitText(admin, "Usuário bloqueado. As sessões dele foram encerradas.");

    await oper.goto(`${BASE}/conta`);
    await waitPath(oper, "/login");
    await fill(oper, { email: OPER.email, password: OPER.password });
    await submit(oper);
    await waitText(oper, "Seu acesso está bloqueado");
  });

  it("logout encerra a sessão; voltar no histórico não reabre a área restrita", async () => {
    await admin.goto(`${BASE}/`);
    await admin.evaluate(() => {
      const btn = [...document.querySelectorAll('[data-testid="sidebar-desktop"] button')].find((b) => b.textContent?.includes("Sair"));
      (btn as HTMLButtonElement).click();
    });
    await waitPath(admin, "/login");
    await admin.goto(`${BASE}/usuarios`);
    await waitPath(admin, "/login");
  });

  it("recuperação de senha: link de uso único por e-mail, nova senha funciona e a antiga não", async () => {
    await admin.goto(`${BASE}/recuperar-senha`);
    await fill(admin, { email: ADMIN.email });
    await submit(admin);
    await waitText(admin, "Se o e-mail estiver cadastrado e ativo");

    const files = (await readdir(".outbox")).sort();
    const mail = JSON.parse(await readFile(path.join(".outbox", files[files.length - 1]), "utf8"));
    expect(mail.to).toBe(ADMIN.email);
    const link = mail.text.match(/https?:\/\/\S+/)[0] as string;
    expect(link.startsWith(`${BASE}/redefinir-senha?token=`)).toBe(true);

    await admin.goto(link);
    await fill(admin, { password: "NovaSenhaAdmin678", confirm: "NovaSenhaAdmin678" });
    await submit(admin);
    await waitPath(admin, "/login");
    await waitText(admin, "Senha redefinida");

    await login(admin, ADMIN.email, ADMIN.password);
    await waitText(admin, "E-mail ou senha inválidos.");
    await login(admin, ADMIN.email, "NovaSenhaAdmin678");
    await waitPath(admin, "/");

    await admin.goto(link);
    await fill(admin, { password: "OutraSenhaAdmin999", confirm: "OutraSenhaAdmin999" });
    await submit(admin);
    await waitText(admin, "Link inválido ou expirado");
  });
});
