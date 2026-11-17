import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { getEnv } from "./env";

export type Mail = { to: string; subject: string; text: string };

export const OUTBOX_DIR = path.join(process.cwd(), ".outbox");

/**
 * Envia e-mail conforme MAIL_TRANSPORT:
 *  - smtp: servidor configurado em SMTP_*;
 *  - file: grava em .outbox/ (desenvolvimento e testes);
 *  - none: não envia e registra aviso no log — a falha nunca é tratada como sucesso.
 */
export async function sendMail(mail: Mail): Promise<{ sent: boolean }> {
  const env = getEnv();
  if (env.MAIL_TRANSPORT === "file") {
    await mkdir(OUTBOX_DIR, { recursive: true });
    const file = path.join(OUTBOX_DIR, `${Date.now()}-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify({ ...mail, from: env.MAIL_FROM, date: new Date().toISOString() }, null, 2));
    return { sent: true };
  }
  if (env.MAIL_TRANSPORT === "smtp") {
    if (!env.SMTP_HOST || !env.SMTP_PORT) throw new Error("SMTP_HOST e SMTP_PORT são obrigatórios com MAIL_TRANSPORT=smtp");
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    await transport.sendMail({ from: env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
    return { sent: true };
  }
  console.warn(`[mail] MAIL_TRANSPORT=none: e-mail "${mail.subject}" NÃO foi enviado.`);
  return { sent: false };
}
