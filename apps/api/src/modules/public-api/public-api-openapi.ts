import type { OpenAPIObject } from '@nestjs/swagger';

let publicOpenApi: OpenAPIObject | null = null;

export function setPublicOpenApiDocument(document: OpenAPIObject): void {
  publicOpenApi = document;
}

export function getPublicOpenApiDocument(): OpenAPIObject | null {
  return publicOpenApi;
}

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
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>
`;
