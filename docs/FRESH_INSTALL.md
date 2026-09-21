# Instalação limpa em produção

Como o sistema sobe **sozinho** depois de uma tag de versão (`v1.2.3`, não `v.1.2.3`): testes → imagens → banco/migrations → página `/setup` ou login.

Passo a passo de lançamento: `docs/RELEASE.md`.

## O que acontece sem comando manual

1. O GitHub roda os testes essenciais (incluindo instalação limpa).
2. Publica as imagens no GHCR.
3. Se a VPS estiver ligada ao GitHub (`SWARM_HOST` + SSH), o deploy roda sozinho.
4. API e worker aplicam `prisma migrate deploy` no boot (fonte de verdade no Portainer). O serviço `migrate` da stack pode criar o database na instalação inicial e permanece opcional no pré-deploy.
5. Você abre o domínio do frontend:
   - **primeira vez** → `/setup` (nome da clínica, primeiro administrador, senha)
   - **já instalado** → `/login`

Não use seed de demonstração em produção (`admin@sonder.local` / `Sonder@123` são só para desenvolvimento).

O token `INITIAL_SETUP_TOKEN` e o `DATABASE_URL` entram como **Docker secrets** no Swarm (`initial_setup_token`, `database_url`). O `deploy.sh` cria esses secrets a partir do `.env` da VPS se ainda não existirem. A página `/setup` pede o token no formulário; o Next.js **não** injeta o token sozinho.

## O PostgreSQL precisa ter o database criado antes?

Não, no fluxo suportado. No `.env` da VPS (usado pelo `deploy.sh` para popular secrets):

- `DATABASE_URL` — usuário runtime e database da aplicação (ex.: `sonder_clinic`); montado como secret `database_url`
- `DATABASE_ADMIN_URL` (opcional) — secret `database_admin_url` no serviço `migrate`
- `INITIAL_SETUP_TOKEN` — secret `initial_setup_token` na API; cole o mesmo valor no campo de token de `/setup`

Se `sonder_clinic` ainda não existir, o bootstrap cria. Se já existir, segue direto para as migrations.

Não conceda `CREATEDB` permanente ao usuário runtime só para facilitar o setup. Prefira `DATABASE_ADMIN_URL` só no bootstrap.

## Quem cria o database e com qual credencial?

O serviço `migrate` da stack (acionado por `infra/swarm/scripts/deploy.sh`) usa:

1. `DATABASE_ADMIN_URL` se definida; senão tenta o mesmo usuário de `DATABASE_URL` no database `postgres`
2. lock consultivo PostgreSQL (idempotente, seguro para redeploy)
3. `CREATE DATABASE` apenas se o alvo não existir
4. `ALTER DATABASE … OWNER` para o usuário de `DATABASE_URL` quando possível

Se faltar permissão, o processo **falha com instrução clara**. Não derruba nem recria banco existente. Senhas/URLs completas não vão para o log.

## Quando as migrations são executadas?

Somente `prisma migrate deploy` (nunca `migrate dev` nem seed).

**Fonte de verdade (1.3.10+):** no **boot da API e do worker**, via `runBootMigrations` de `@sonder/database` (hidrata secret `database_url`, lock consultivo PostgreSQL, `migrate deploy`, verifica tabelas **e** colunas críticas como `Receivable.externalId` / `Patient.externalCalendarEventId`). Se o migrate ou a verificação falhar, o processo **sai com erro** e não aceita tráfego / não processa filas. Nos logs: `boot.migrate.version`, `boot.migrate.start`, `boot.migrate.complete` (ou `boot.migrate.failed`).

O serviço Swarm `migrate` (`sonder-clinic_migrate`, `bootstrap-cli.js`) permanece na stack como **pré-deploy opcional**: cria o database se faltar (`DATABASE_ADMIN_URL`) e aplica migrate antes do keep-alive. Útil no `deploy.sh` e na instalação limpa; **não** é necessário forçar `sonder-clinic_migrate` no Portainer só para schema — reiniciar/atualizar API (e worker) basta.

**Automático?**

| Como você atualiza | Migrations rodam? |
|--------------------|-------------------|
| Tag GitHub → CI → `deploy.sh` na VPS | **Sim** — `migrate` one-shot + **boot** de api/worker |
| `./infra/swarm/scripts/deploy.sh` manual na VPS | **Sim** — idem |
| Portainer só troca imagem de `api` / `worker` / `web` | **Sim** — api e worker aplicam migrate no startup |
| Portainer “Update stack” | **Sim** — no boot dos containers api/worker |

Multi-réplica: `pg_advisory_lock` serializa o deploy; demais réplicas esperam e validam o schema (idempotente).

`deploy.sh` recusa `WEB_URL` localhost/HTTP e imagens não definidas. Depois do `docker stack deploy`, espera o serviço `migrate` registrar bootstrap completo (`"event":"complete"` / `"event":"keep_alive"`) quando esse serviço existir. Com boot migrate, o release também fica saudável assim que api/worker passam no readiness com schema atualizado.

Com `BOOTSTRAP_KEEP_ALIVE=true`, o task `migrate` fica Running após aplicar. Reiniciar esse serviço continua opcional (pré-aquecimento / CREATE DATABASE).

API e worker podem subir em paralelo, mas:

- Traefik só envia tráfego à API com `/api/v1/health/ready` (PostgreSQL + Redis + storage)
- o healthcheck Docker da API permanece em `/api/v1/health` (liveness), para um Postgres lento não virar restart loop
- o worker recusa startup em produção sem `DATABASE_URL`, Redis e storage remoto
- se migrate no boot falhar, api/worker reiniciam (fail-fast) até o schema estar aplicável

### Aplicar migrate agora (VPS / Portainer)

Sintoma típico se o schema ficou atrás da imagem: Prisma `P2022` — colunas como `Receivable.externalId`, `Payable.provider`, `Patient.externalCalendarEventId` “does not exist”.

**Preferido (1.3.10+):** atualizar/recriar os serviços **api** e **worker** com a imagem nova — o boot roda `prisma migrate deploy` sozinho.

```bash
docker service update --force sonder-clinic_api
docker service update --force sonder-clinic_worker
docker service logs --tail 100 -f sonder-clinic_api
# Procure: "boot.migrate.complete" (sucesso) ou "boot.migrate.failed"
```

**Opção A — serviço `migrate` da stack** (ainda válido; CREATE DATABASE + migrate):

```bash
# Confirme o nome do stack/serviço (padrão do repo):
docker service ls | grep migrate

# Force recreate (reexecuta bootstrap-cli → prisma migrate deploy):
docker service update --force sonder-clinic_migrate

# Acompanhe até ver event complete / keep_alive (sem failed):
docker service logs --tail 100 -f sonder-clinic_migrate
```

Secrets necessários no serviço `migrate` (já definidos em `stack.production.yml`): `database_url` (obrigatório) e `database_admin_url` (pode ser vazio se o database já existe).

**Opção B — one-shot com a imagem da API** (útil se o serviço `migrate` não existir). No host da VPS, com `.env` de produção:

```bash
set -a && source .env && set +a
# Use a MESMA tag que a API em produção, ex.:
export API_IMAGE="${API_IMAGE:-ghcr.io/mond-day/sonder-clinic-api:1.3.10}"

docker run --rm \
  --network digital_network \
  -e NODE_ENV=production \
  -e DATABASE_URL="$DATABASE_URL" \
  ${DATABASE_ADMIN_URL:+-e DATABASE_ADMIN_URL="$DATABASE_ADMIN_URL"} \
  "$API_IMAGE" \
  node packages/database/dist/bootstrap-cli.js
```

Não use `prisma migrate dev`, seed, reset ou `DROP DATABASE`.

### Verificar se as colunas existem

No Postgres da clínica (psql / cliente admin):

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('Receivable', 'Payable', 'Patient')
  AND column_name IN ('externalId', 'provider', 'externalCalendarEventId')
ORDER BY table_name, column_name;
```

Esperado: `Patient.externalCalendarEventId`, `Payable.provider`, `Receivable.externalId` (e `Payable.externalId`).

### Fallback SQL one-shot (se ainda faltar coluna após 1.3.10)

Se `_prisma_migrations` já marca a migration como aplicada mas a coluna não existe (histórico divergente), rode no Postgres:

```sql
ALTER TABLE "Receivable" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Payable" ADD COLUMN IF NOT EXISTS "provider" "IntegrationProvider";
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "externalCalendarEventId" TEXT;
```

A 1.3.10+ também tenta esse repair automaticamente no boot (`boot.migrate.columns_missing` → `schema.columns.repair.*`) e só sobe se as colunas existirem.

Ou no container da API/migrate:

```bash
docker exec -it $(docker ps -q -f name=sonder-clinic_api) \
  node node_modules/prisma/build/index.js migrate status \
  --schema packages/database/prisma/schema.prisma
```

(`DATABASE_URL` precisa estar disponível no processo; na API de produção ela vem do secret via `hydrateDockerSecrets`.)

## O que ocorre se a migration falhar?

- API e worker **falham o boot** (`boot.migrate.failed`) e reiniciam até o schema ser aplicável
- o serviço `migrate` (se usado) reinicia com `on-failure` até o limite
- `deploy.sh` marca o release como falho se o one-shot `migrate` não concluir
- **não** rode seed, reset ou `DROP DATABASE`
- API nova não deve receber tráfego (processo morto / readiness falha sem schema)

Na VPS, o diagnóstico é `prisma migrate status` no container da API. `prisma migrate resolve` só com intervenção consciente.

## Como saber se está atualizado?

- o domínio abre `/setup` (vazio) ou `/login` (já instalado)
- `GET /api/v1/health/ready` retorna `ready` quando o stack está saudável
- tabela `_prisma_migrations` existe e `finished_at` preenchido

Redeploy da mesma versão é idempotente: o bootstrap não recria o database nem altera dados.

## Primeiro acesso (página `/setup`)

1. Deploy concluiu (database + migrations).
2. Abra o domínio do frontend. O sistema detecta instalação vazia e mostra `/setup`.
3. Preencha o **token de instalação** (`INITIAL_SETUP_TOKEN` da API), o nome da clínica, o primeiro administrador e a senha (não depende de SMTP).
4. Depois do sucesso, `/setup` fica indisponível. Entre em `/login` com o admin criado.

Se o domínio já tiver organização/usuários, vai direto para o login.

O token de instalação não é JWT, não é gravado no banco e não deve aparecer em logs. Depois de concluído, o setup não reabre (`409`).

SMTP continua obrigatório para reset de senha e convites de usuários adicionais — falha explícita se `SMTP_HOST` estiver ausente.

## Como recuperar instalação inconsistente?

O status de setup pode ficar `INCONSISTENT` quando existem organização/usuários **sem** o registro `SystemInstallation` (por exemplo, seed de demo em produção).

O setup **não reabre** se:

- o singleton `SystemInstallation` existe
- todos os usuários foram bloqueados
- a organização foi arquivada

Recuperação é operacional (SQL consciente / restore de backup), não um backdoor de setup.

## Variáveis canônicas

| Variável | Significado |
|----------|-------------|
| `WEB_URL` | URL pública HTTPS do frontend (e-mails, OAuth, QR) |
| `API_URL` | URL pública da API (e-mails, links, fallback de redirect Google). **OAuth Google 1.3.13+:** o redirect vem da UI (`NEXT_PUBLIC_API_URL`); `API_URL` no Swarm continua útil, mas não é obrigatório só para conectar o Google |
| `CORS_ORIGIN` | origens autorizadas (no stack de prod = `WEB_URL`) |
| `APP_HOST` / `API_HOST` | hosts do Traefik |
| `COOKIE_SECURE` | obrigatório `true` em produção |
| `INITIAL_SETUP_TOKEN` | secret do primeiro setup (só na API; o operador informa em `/setup`) |
| `DATABASE_ADMIN_URL` | só bootstrap, se o database alvo ainda não existir |
| `GOOGLE_CALENDAR_MOCK` / `NIBO_MOCK` | em produção: **ausente ou `false`** (fail-fast só recusa `true`; `deploy.sh` também). Recomendado setar `false` no Portainer |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **opcional** — fallback ops; preferir Client ID/Secret na UI (Integrações), criptografados na conexão |
| `GOOGLE_REDIRECT_URI` | **opcional** — fallback ops; preferir a URL exibida na UI (igual ao N8N). Canônico: `https://<API_HOST>/api/v1/integrations/google/callback` |
| `NIBO_PULL_ENABLED` | pull automático Nibo→Financeiro no worker (default `true`) |

`APP_URL` foi removido do stack; use `WEB_URL`.

### Env mínima para boot (API + worker) — Portainer / Swarm

O fail-fast **não** exige `GOOGLE_CLIENT_*`. Em **1.3.8+** também **não** exige `*_MOCK=false` explícito (ausência = off); só recusa se `*_MOCK=true`.

**API (env + secrets Docker):**

| Chave | Onde | Notas |
|-------|------|-------|
| `NODE_ENV=production` | env | |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | secrets | ≥32 chars, ≠ defaults do `.env.example` |
| `ENCRYPTION_MASTER_KEY` | secret | 64 hex, ≠ default do example |
| `COOKIE_SECURE=true` | env | stack já fixa |
| `DATABASE_URL` | secret | Postgres remoto (não localhost) |
| `QUEUE_DRIVER=redis` + `REDIS_URL` | env | Redis remoto |
| `STORAGE_DRIVER=s3` (ou minio) + `S3_*` | env + secrets | não `local` |
| `WEB_URL` + `CORS_ORIGIN` | env | HTTPS público (stack: CORS=`WEB_URL`) |
| `API_URL` | env (stack) | útil para e-mails/links; redirect Google OAuth vem da UI em 1.3.13+ |
| `GOOGLE_CALENDAR_MOCK` / `NIBO_MOCK` | env | opcional; **não** use `true` |

**Worker:** `NODE_ENV`, `DATABASE_URL`, `QUEUE_DRIVER`+`REDIS_URL`, `STORAGE_DRIVER`+`S3_*`, `ENCRYPTION_MASTER_KEY`, e opcionalmente `*_MOCK=false`.

### Google Calendar (produção)

1. No `.env` / Portainer: `GOOGLE_CALENDAR_MOCK=false` (recomendado; ausência também é off em 1.3.8+). `GOOGLE_CLIENT_*` / `GOOGLE_REDIRECT_URI` / `API_URL` são **opcionais para o OAuth** se o serviço **web** já tiver `NEXT_PUBLIC_API_URL` correto (a UI envia o redirect).
2. No app: Configurações → Integrações → Google Agenda — copie a **URL de redirecionamento OAuth** exibida.
3. No [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client → **Authorized redirect URIs**: cole exatamente a URL da UI (ex.: `https://api.<seu-dominio>/api/v1/integrations/google/callback`).
4. Cole **Client ID** e **Client Secret** na UI, salve, use **Conectar / Autenticar** e autorize (mesma aba). Não é necessário editar Swarm só para o redirect.
5. Redeploy se mudar MOCK (`deploy.sh` recusa `MOCK=true`).

### Nibo (produção)

1. `NIBO_MOCK=false` (ou omitido em 1.3.8+) + API Key na conexão Integrações (status ACTIVE).
2. Selecione categorias (filtram a receber **e** a pagar) e, se quiser, centros de custo (filtro adicional em a pagar).
3. **Sincronizar com Nibo** importa na hora; o worker também puxa periodicamente (`NIBO_PULL_*`). Logs: `nibo-pull.tick` / `nibo-pull.enqueued` / `nibo-pull.completed` (ou `skipReason` se MOCK/sem conexão ACTIVE).

## Deploy manual na VPS (se o GitHub ainda não tem SSH)

Só necessário quando os secrets `SWARM_HOST` / `SWARM_SSH_KEY` não estão no GitHub. Com o `.env` de produção já na VPS:

```bash
export API_IMAGE=ghcr.io/mond-day/sonder-clinic-api:1.2.4
export WEB_IMAGE=ghcr.io/mond-day/sonder-clinic-web:1.2.4
export WORKER_IMAGE=ghcr.io/mond-day/sonder-clinic-worker:1.2.4
./infra/swarm/scripts/deploy.sh
```

Depois abra o domínio. Detalhes de tag e CI: `docs/RELEASE.md`.

## Recursos que não são reais (ainda)

Ver `docs/IMPLEMENTATION_STATUS.md`: SMS stub, webhooks da API pública (FUTURE), import Codental desabilitado, integrações MOCK, `CommissionEntry`/`Expense` legado.
