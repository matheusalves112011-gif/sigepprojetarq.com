import { rm } from "node:fs/promises";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { Page } from "puppeteer-core";

export const BASE = "http://localhost:3100";
export const SHOTS = "tests/e2e/screenshots";
export const DESKTOP = { width: 1366, height: 850 };
export const MOBILE = { width: 390, height: 844, isMobile: true, hasTouch: true };

const env = config({ path: ".env.test", override: true, quiet: true }).parsed ?? {};

export function testPool(): Pool {
  if (!/_test$/.test(new URL(env.DATABASE_URL).pathname)) throw new Error("e2e exige banco terminado em _test");
  return new Pool({ connectionString: env.DATABASE_URL, max: 2 });
}

/** Cada arquivo de teste de ponta a ponta começa com o banco de testes recriado pelas migrações. */
export async function resetE2eDb(): Promise<void> {
  const pool = testPool();
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
  await rm(".outbox", { recursive: true, force: true });
}

export async function waitPath(page: Page, pathname: string | RegExp) {
  const src = typeof pathname === "string" ? null : pathname.source;
  await page.waitForFunction((p, re) => (re ? new RegExp(re).test(location.pathname) : location.pathname === p), { timeout: 20_000 }, pathname as string, src);
}
export async function waitText(page: Page, text: string) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 20_000 }, text);
}
export const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);

/** Preenche campos pelo atributo name (texto, data, área de texto). */
export async function setFields(page: Page, fields: Record<string, string>) {
  for (const [name, value] of Object.entries(fields)) {
    await page.waitForSelector(`main [name="${name}"]`);
    await page.$eval(
      `main [name="${name}"]`,
      (el, v) => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      value,
    );
  }
}

/** Escolhe, num <select>, a opção cujo texto contém o trecho informado. */
export async function selectByText(page: Page, name: string, text: string) {
  await page.waitForSelector(`main select[name="${name}"]`);
  await page.$eval(
    `main select[name="${name}"]`,
    (el, t) => {
      const select = el as HTMLSelectElement;
      const option = [...select.options].find((o) => o.text.includes(t));
      if (!option) throw new Error(`opção "${t}" não encontrada em ${select.name}`);
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    },
    text,
  );
}

export async function clickButton(page: Page, text: string) {
  await page.waitForFunction((t) => [...document.querySelectorAll("main button")].some((b) => b.textContent?.trim() === t), { timeout: 20_000 }, text);
  await page.evaluate((t) => ([...document.querySelectorAll("main button")].find((b) => b.textContent?.trim() === t) as HTMLButtonElement).click(), text);
}

export async function clickLink(page: Page, text: string) {
  await page.waitForFunction((t) => [...document.querySelectorAll("main a")].some((a) => a.textContent?.trim() === t), { timeout: 20_000 }, text);
  await page.evaluate((t) => ([...document.querySelectorAll("main a")].find((a) => a.textContent?.trim() === t) as HTMLAnchorElement).click(), text);
}

export async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await setFields(page, { email, password });
  await clickButton(page, "Entrar");
  await waitPath(page, "/");
}

export const stat = (page: Page, label: string) => page.$eval(`[data-testid="stat-${label}"]`, (el) => el.textContent?.replace(/\s/g, " "));
export const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
