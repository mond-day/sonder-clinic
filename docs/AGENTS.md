# Guia para agentes (Sonder Clinic)

Contexto operacional do monorepo. Preferir este arquivo + `IMPLEMENTATION_STATUS.md` + `PRODUCTION_READINESS.md` a specs longas em `docs/archive/`.

## Arquitetura

| Pacote / app | Papel |
|--------------|--------|
| `apps/api` | NestJS, prefixo `/api/v1`, guards JWT + permissões |
| `apps/web` | Next.js App Router, UI PT-BR |
| `apps/worker` | Polling de `OutboxEvent` (WhatsApp reminder, automation) |
| `packages/database` | Prisma schema + migrations + seed |
| `packages/storage` | `STORAGE_DRIVER=local` (dev) ou `minio`/`s3` (prod) |

Isolamento: `organizationId` no JWT; clínicas via query/`clinicId`.

## Convenções

- Validação: Zod nos services (`parseWithZod`) + class-validator nos DTOs.
- Permissões: `@RequirePermissions('a', 'b')` = OR; seed em `packages/database/prisma/seed.ts`.
- Soft-delete preferido (`EntityStatus` ACTIVE/INACTIVE) em unidades/cadeiras.
- Integrações: sem credencial ou `*_MOCK=true` → desabilitado com erro explícito (nunca falso sucesso).
- Migrations **aditivas**; APIs additive quando possível.
- UI em português.

## Como rodar (dev)

```bash
# Preferir
./script/dev.command
# ou
pnpm install && pnpm db:generate && pnpm db:deploy && pnpm db:seed
pnpm dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api/v1` · Swagger `/docs`
- Login seed: `admin@sonder.local` / `Sonder@123`
- `script/dev.command` libera portas 3000/4000 de sessões anteriores deste repo.

Gates locais: `pnpm typecheck`, `pnpm test`, `env -u NODE_ENV pnpm build`, `pnpm test:e2e`.

## Env vars críticas

Ver `.env.example`. Em resumo:

- Auth: `JWT_*`, `ENCRYPTION_MASTER_KEY` (64 hex)
- DB: `DATABASE_URL`
- Storage: `STORAGE_DRIVER`, `STORAGE_LOCAL_PATH` ou `S3_*`
- Queue: `QUEUE_DRIVER=memory|redis`
- SMTP: `SMTP_HOST` (password reset)
- Integrações: `*_MOCK` + credenciais

## Protótipos HTML

Índice e pacotes em [`HTML_REFERENCIAS/README.md`](../HTML_REFERENCIAS/README.md) (~312KB). Não duplicar megabytes na raiz.

## Specs históricas

`docs/archive/` — implementação integral e plano frontend. Usar só quando precisar de detalhe de domínio; o código + status atual prevalecem.

## Gaps conhecidos de prod

Ver `PRODUCTION_READINESS.md`.
