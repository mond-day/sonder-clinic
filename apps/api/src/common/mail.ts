import { BadRequestException } from '@nestjs/common';
import nodemailer from 'nodemailer';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST?.trim());
}

export function assertSmtpConfigured() {
  if (!smtpConfigured()) {
    throw new BadRequestException(
      'SMTP não configurado. Defina SMTP_HOST (e opcionalmente SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM) para enviar e-mails.',
    );
  }
}

/** Envio SMTP real. Sem host → erro explícito (sem falso sucesso). */
export async function sendMail(message: MailMessage): Promise<void> {
  assertSmtpConfigured();
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD ?? '';
  const from = process.env.SMTP_FROM?.trim() || user || 'noreply@sonder.clinic';

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass: password } : undefined,
  });

  try {
    await transporter.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'erro desconhecido';
    throw new BadRequestException(`Não foi possível enviar e-mail via SMTP: ${detail}`);
  } finally {
    transporter.close();
  }
}
