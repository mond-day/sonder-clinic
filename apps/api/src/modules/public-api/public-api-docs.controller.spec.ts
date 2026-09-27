import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import helmet from 'helmet';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PublicApiDocsController } from './public-api-docs.controller';
import { PUBLIC_API_SCALAR_HTML, setPublicOpenApiDocument } from './public-api-openapi';

function parseCsp(header: string | null): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of (header ?? '').split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives.set(name, values);
  }
  return directives;
}

describe('PublicApiDocsController', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    setPublicOpenApiDocument({ openapi: '3.0.0', info: { title: 't', version: '1' }, paths: {} });
    const controller = new PublicApiDocsController();
    const app = express();
    // Mesma configuração de produção do main.ts (SWAGGER_ENABLED desligado).
    app.use(helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    app.get('/api/v1/public/docs', (_req, res) => controller.docs(res));
    app.get('/api/v1/public/openapi.json', (_req, res) => { res.json(controller.openapi()); });
    await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('libera no CSP da página de docs o CDN do Scalar e o fetch do openapi.json', async () => {
    const response = await fetch(`${baseUrl}/api/v1/public/docs`);
    const csp = parseCsp(response.headers.get('content-security-policy'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(csp.get('script-src')).toEqual(["'self'", 'https://cdn.jsdelivr.net']);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    expect(csp.get('style-src')).toContain("'unsafe-inline'");
    expect(csp.get('font-src')).toContain('https://fonts.scalar.com');
    expect(csp.get('default-src')).toEqual(["'none'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('script-src')).not.toContain("'unsafe-inline'");
    expect(csp.get('script-src')).not.toContain("'unsafe-eval'");
  });

  it('mantém o CSP restrito do helmet nas demais rotas', async () => {
    const response = await fetch(`${baseUrl}/api/v1/public/openapi.json`);
    const csp = parseCsp(response.headers.get('content-security-policy'));

    expect(response.status).toBe(200);
    expect(csp.get('script-src')).toEqual(["'self'"]);
    expect(csp.has('connect-src')).toBe(false);
    expect(csp.get('default-src')).toEqual(["'none'"]);
  });

  it('carrega o Scalar com versão fixa e SRI', () => {
    const src = /<script src="([^"]+)" integrity="(sha384-[A-Za-z0-9+/=]+)" crossorigin="anonymous"><\/script>/.exec(PUBLIC_API_SCALAR_HTML);

    expect(src?.[1]).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@\d+\.\d+\.\d+\//);
    expect(src?.[2]).toBeDefined();
    expect(PUBLIC_API_SCALAR_HTML).toContain('data-url="/api/v1/public/openapi.json"');
  });
});
