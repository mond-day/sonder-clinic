# Guia para agentes (Sonder Clinic)

Contexto operacional do monorepo. Preferir `docs/README.md` + este arquivo + `IMPLEMENTATION_STATUS.md` + `PRODUCTION_READINESS.md` a specs em `docs/archive/`.

## Arquitetura

| Pacote / app | Papel |
|--------------|--------|
| `apps/api` | NestJS, prefixo `/api/v1`, guards JWT + permissões |
| `apps/web` | Next.js App Router, UI PT-BR |
| `apps/worker` | Polling de `OutboxEvent` + geração de recorrências financeiras |
| `packages/database` | Prisma schema + migrations + seed |
| `packages/storage` | Storage local/MinIO/S3 + scanner ClamAV (INSTREAM) |
| `packages/observability` | OpenTelemetry opcional (`OTEL_ENABLED`) |

Isolamento: `organizationId` no JWT; clínicas via query/`clinicId`.

## Convenções

- Validação: Zod nos services (`parseWithZod`) + class-validator nos DTOs.
- Permissões: `@RequirePermissions('a', 'b')` = OR; seed em `packages/database/prisma/seed.ts`.
- Soft-delete preferido (`EntityStatus` ACTIVE/INACTIVE) em unidades/cadeiras.
- Integrações / AV / OTEL: sem credencial ou flag off → desabilitado com erro/status explícito (nunca falso sucesso).
- Migrations **aditivas**; APIs additive quando possível.
- UI em português.

## Como rodar (dev)

```bash
./script/dev.command
# ou
pnpm install && pnpm db:generate && pnpm db:deploy && pnpm db:seed
pnpm dev
```

Produção (VPS nova): `docs/FRESH_INSTALL.md` — `pnpm db:bootstrap` + `/setup`. Nunca `db:seed` em produção.

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api/v1` · Swagger `/docs` · Health `/api/v1/health`
- Login seed: `admin@sonder.local` / `Sonder@123`

Gates: `pnpm typecheck`, `pnpm test`, `env -u NODE_ENV pnpm build`, `pnpm test:e2e`.

## Env vars críticas

Ver `.env.example`. Resumo:

| Grupo | Vars |
|-------|------|
| Auth | `JWT_*`, `ENCRYPTION_MASTER_KEY` (64 hex), `COOKIE_SECURE` |
| Banco | `DATABASE_URL`, `DATABASE_ADMIN_URL` (só bootstrap) |
| Setup | `INITIAL_SETUP_TOKEN` (produção, só na API; o operador informa em `/setup`) |
| Storage | `STORAGE_DRIVER`, `STORAGE_LOCAL_PATH` ou `S3_*` |
| Antivirus | `AV_DRIVER=stub\|disabled\|clamav`, `CLAMAV_HOST`, `CLAMAV_PORT` |
| Queue | `QUEUE_DRIVER=memory\|redis`, `REDIS_URL` |
| SMTP | `SMTP_HOST` (password reset) |
| OTEL | `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT` |
| Integrações | `*_MOCK` + credenciais; Google: `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI`/`CALENDAR_ID`; Evolution: `EVOLUTION_BASE_URL`/`API_KEY`/`INSTANCE` |

## Protótipos HTML

[`docs/HTML_REFERENCES.md`](./HTML_REFERENCES.md) — o pacote de protótipos `HTML_REFERENCIAS/` foi removido na 1.2.2.

## Specs históricas

`docs/archive/` — não são fonte de verdade. Código + status atual prevalecem.

## Gaps de prod

Ver `PRODUCTION_READINESS.md` (ops/infra, não “código residual” da 1.1.6).
