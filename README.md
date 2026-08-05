# Sonder Clinic

ERP odontológico interno em monorepo com Next.js, NestJS, worker e PostgreSQL.

## Desenvolvimento

Requisitos: Node.js 24, Corepack, Docker Desktop.

```bash
corepack enable
./script/dev.command
```

No Windows, execute `script\dev.exe` pelo Prompt de Comando.

Serviços:

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1
- Swagger: http://localhost:4000/docs
- Healthcheck: http://localhost:4000/api/v1/health

Login fictício após o seed:

- E-mail: `admin@sonder.local`
- Senha: `Sonder@123`

## Comandos

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Consulte `docs/IMPLEMENTATION_STATUS.md`, `docs/RELEASE.md`, `docs/SECURITY.md` e `docs/DUVIDAS_PARA_RESPONDER.md`.

## Produção e imagens

- Domínio padrão: `app.sonder.clinic` (configurável por env).
- Imagens: `ghcr.io/mond-day/sonder-clinic-{api,web,worker}`.
- Deploy Swarm: `infra/swarm/stack.production.yml` (networks `digital_network`, `traefik_public`).
- Release: `docs/RELEASE.md` (tag `v1.0.0`, push, GHCR).

## Repositório

https://github.com/mond-day/sonder-clinic
