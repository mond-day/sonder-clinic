import { createHash, randomBytes } from 'node:crypto';

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateInviteToken(): string {
  return randomBytes(24).toString('hex');
}

export function inviteExpiresAt(expiresInHours = 72): Date {
  return new Date(Date.now() + expiresInHours * 3600_000);
}

export function buildInviteUrl(webUrl: string, token: string): string {
  const base = webUrl.replace(/\/$/, '');
  return `${base}/login?inviteToken=${encodeURIComponent(token)}`;
}

export function buildInviteEmail(input: {
  name: string;
  organizationName: string;
  inviteUrl: string;
  expiresAt: Date;
}): { subject: string; text: string } {
  return {
    subject: `Convite — ${input.organizationName}`,
    text: [
      `Olá, ${input.name}.`,
      '',
      `Você foi convidado(a) para o Sonder Clinic (${input.organizationName}).`,
      'Abra o link abaixo para definir sua senha e ativar o acesso:',
      input.inviteUrl,
      '',
      `O convite expira em ${input.expiresAt.toISOString()}.`,
      'Se você não esperava este e-mail, ignore-o.',
    ].join('\n'),
  };
}
