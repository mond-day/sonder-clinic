import { looksLocalHost } from './production-env';

export class PublicWebUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicWebUrlError';
  }
}

/**
 * URL pública canônica do frontend.
 * Em produção não há fallback para localhost.
 */
export function resolvePublicWebUrl(env: NodeJS.ProcessEnv = process.env): string {
  const isProd = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  const configured = env.WEB_URL?.trim();
  if (isProd) {
    if (!configured) {
      throw new PublicWebUrlError('WEB_URL é obrigatório em produção (URL pública HTTPS do frontend).');
    }
    if (looksLocalHost(configured) || /localhost|127\.0\.0\.1/i.test(configured)) {
      throw new PublicWebUrlError('WEB_URL não pode apontar para localhost em produção.');
    }
    if (!/^https:\/\//i.test(configured)) {
      throw new PublicWebUrlError('WEB_URL deve usar HTTPS em produção.');
    }
    return configured.replace(/\/$/, '');
  }
  return (configured || 'http://localhost:3000').replace(/\/$/, '');
}

export function assertNoLocalhostLink(url: string, context: string): void {
  if (looksLocalHost(url) || /localhost|127\.0\.0\.1/i.test(url)) {
    throw new PublicWebUrlError(`${context} gerou link localhost, o que é inválido neste ambiente.`);
  }
}
