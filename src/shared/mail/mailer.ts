import nodemailer from "nodemailer";
import { env } from "../../config/env";
import { logger } from "../logger";

/** Sem SMTP_HOST configurado, os emails não saem: são só escritos no log (útil em desenvolvimento). */
const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const info = await transport.sendMail({ from: env.MAIL_FROM, to, subject, html });
  if (!env.SMTP_HOST) logger.info("Email não enviado (SMTP_HOST vazio)", { to, subject });
  else logger.info("Email enviado", { to, subject, messageId: info.messageId });
}
