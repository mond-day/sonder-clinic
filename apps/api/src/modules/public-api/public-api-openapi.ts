import type { OpenAPIObject } from '@nestjs/swagger';

let publicOpenApi: OpenAPIObject | null = null;

export function setPublicOpenApiDocument(document: OpenAPIObject): void {
  publicOpenApi = document;
}

export function getPublicOpenApiDocument(): OpenAPIObject | null {
  return publicOpenApi;
}

// Versão fixa: o hash SRI é do arquivo dist/browser/standalone.js publicado no npm; trocar a versão exige recalcular.
const SCALAR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.1/dist/browser/standalone.js';
const SCALAR_SCRIPT_INTEGRITY = 'sha384-U11tb2XnKvmwt8RlTvnwUnYgrN+ur4Xyh9htLhjajWNR/Oyl5AX5DEz00qRmlrmK';

// Aplicado só em GET /public/docs; o restante da API mantém o CSP restrito do helmet.
// O bundle do Scalar injeta CSS inline, baixa fontes de fonts.scalar.com e usa blob: em previews.
export const PUBLIC_API_DOCS_CSP = [
  "default-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data: https://fonts.scalar.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

export const PUBLIC_API_SCALAR_HTML = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sonder Clinic — API pública</title>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/v1/public/openapi.json"
      data-configuration='{"hideClientButton":true}'
    ></script>
    <script src="${SCALAR_SCRIPT_URL}" integrity="${SCALAR_SCRIPT_INTEGRITY}" crossorigin="anonymous"></script>
  </body>
</html>
`;
