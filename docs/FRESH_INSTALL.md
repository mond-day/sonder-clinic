# Instalação limpa em produção

Como o sistema sobe **sozinho** depois de uma tag de versão (`v1.2.3`, não `v.1.2.3`): testes → imagens → banco/migrations → página `/setup` ou login.

Passo a passo de lançamento: `docs/RELEASE.md`.

## O que acontece sem comando manual

1. O GitHub roda os testes essenciais (incluindo instalação limpa).
2. Publica as imagens no GHCR.
3. Se a VPS estiver ligada ao GitHub (`SWARM_HOST` + SSH), o deploy roda sozinho.
4. O serviço `migrate` cria o database se faltar e aplica `prisma migrate deploy`.
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

Somente `prisma migrate deploy` (nunca `migrate dev` nem seed), no serviço Swarm `migrate` (`sonder-clinic_migrate`), via `node packages/database/dist/bootstrap-cli.js`.

**Automático?** Só no fluxo oficial:

| Como você atualiza | Migrations rodam? |
|--------------------|-------------------|
| Tag GitHub → CI → `deploy.sh` na VPS | **Sim** — `deploy.sh` faz `docker stack deploy` e espera o `migrate` concluir |
| `./infra/swarm/scripts/deploy.sh` manual na VPS | **Sim** — idem |
| Portainer só troca imagem de `api` / `worker` / `web` | **Não** — o serviço `migrate` não reinicia; schema fica atrasado |
| Portainer “Update stack” sem mudar a definição/`API_IMAGE` do `migrate` | **Não** (ou só se o task `migrate` for recriado de fato) |

API e worker **não** aplicam migrations no boot (de propósito — migrate no start da API é perigoso com réplicas).

`deploy.sh` recusa `WEB_URL` localhost/HTTP e imagens não definidas. Depois do `docker stack deploy`, espera o serviço `migrate` registrar bootstrap completo (`"event":"complete"` / `"event":"keep_alive"`). Só então o release é considerado concluído.

Com `BOOTSTRAP_KEEP_ALIVE=true`, o task `migrate` fica Running após aplicar. Para **reaplicar** migrations (nova versão de schema), o task precisa reiniciar — tipicamente nova `API_IMAGE` no serviço `migrate` + `docker service update --force sonder-clinic_migrate`, ou um one-shot (abaixo).

API e worker podem subir em paralelo, mas:

- Traefik só envia tráfego à API com `/api/v1/health/ready` (PostgreSQL + Redis + storage)
- o healthcheck Docker da API permanece em `/api/v1/health` (liveness), para um Postgres lento não virar restart loop
- o worker recusa startup em produção sem `DATABASE_URL`, Redis e storage remoto

### Aplicar migrate agora (VPS / Portainer)

Sintoma típico se o schema ficou atrás da imagem: Prisma `P2022` — colunas como `Receivable.externalId`, `Payable.provider`, `Patient.externalCalendarEventId` “does not exist”.

**Opção A — reiniciar o serviço one-shot da stack** (usa a mesma `API_IMAGE` e secrets `database_url` + `database_admin_url`):

```bash
# Confirme o nome do stack/serviço (padrão do repo):
docker service ls | grep migrate

# Force recreate (reexecuta bootstrap-cli → prisma migrate deploy):
docker service update --force sonder-clinic_migrate

# Acompanhe até ver event complete / keep_alive (sem failed):
docker service logs --tail 100 -f sonder-clinic_migrate
```

Secrets necessários no serviço `migrate` (já definidos em `stack.production.yml`): `database_url` (obrigatório) e `database_admin_url` (pode ser vazio se o database já existe).

**Opção B — one-shot com a imagem da API** (útil se o serviço `migrate` não existir ou Portainer só atualizou api/worker). No host da VPS, com `.env` de produção:

```bash
set -a && source .env && set +a
# Use a MESMA tag que a API em produção, ex.:
export API_IMAGE="${API_IMAGE:-ghcr.io/mond-day/sonder-clinic-api:1.3.8}"

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

Esperado: `Patient.externalCalendarEventId`, `Payable.provider`, `Receivable.externalId`.

Ou no container da API/migrate:

```bash
docker exec -it $(docker ps -q -f name=sonder-clinic_api) \
  node node_modules/prisma/build/index.js migrate status \
  --schema packages/database/prisma/schema.prisma
```

(`DATABASE_URL` precisa estar disponível no processo; na API de produção ela vem do secret via `hydrateDockerSecrets`.)

## O que ocorre se a migration falhar?

- o serviço `migrate` reinicia com `on-failure` até o limite
- `deploy.sh` marca o release como falho
- **não** rode seed, reset ou `DROP DATABASE`
- API nova não deve receber tráfego (readiness falha sem schema)

Na VPS, o diagnóstico é `prisma migrate status` no container da API/migrate. `prisma migrate resolve` só com intervenção consciente.

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
| `API_URL` | URL pública da API para o browser (`NEXT_PUBLIC_API_URL`) |
| `CORS_ORIGIN` | origens autorizadas (no stack de prod = `WEB_URL`) |
| `APP_HOST` / `API_HOST` | hosts do Traefik |
| `COOKIE_SECURE` | obrigatório `true` em produção |
| `INITIAL_SETUP_TOKEN` | secret do primeiro setup (só na API; o operador informa em `/setup`) |
| `DATABASE_ADMIN_URL` | só bootstrap, se o database alvo ainda não existir |
| `GOOGLE_CALENDAR_MOCK` / `NIBO_MOCK` | em produção: **ausente ou `false`** (fail-fast só recusa `true`; `deploy.sh` também). Recomendado setar `false` no Portainer |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **opcional** — fallback ops; preferir Client ID/Secret na UI (Integrações), criptografados na conexão |
| `GOOGLE_REDIRECT_URI` | **opcional** se `API_URL` estiver definido — canônico: `https://<API_HOST>/api/v1/integrations/google/callback` (mesmo valor no Google Cloud Console) |
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
| `API_URL` | env (stack) | URL pública da API; redirect Google deriva daqui |
| `GOOGLE_CALENDAR_MOCK` / `NIBO_MOCK` | env | opcional; **não** use `true` |

**Worker:** `NODE_ENV`, `DATABASE_URL`, `QUEUE_DRIVER`+`REDIS_URL`, `STORAGE_DRIVER`+`S3_*`, `ENCRYPTION_MASTER_KEY`, e opcionalmente `*_MOCK=false`.

### Google Calendar (produção)

1. No `.env` / Portainer: `GOOGLE_CALENDAR_MOCK=false` (recomendado; ausência também é off em 1.3.8+). `GOOGLE_CLIENT_*` / `GOOGLE_REDIRECT_URI` são **opcionais** (redirect deriva de `API_URL` se omitido).
2. No [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client → **Authorized redirect URIs**: cole exatamente `https://api.<seu-dominio>/api/v1/integrations/google/callback` (a UI em Integrações mostra o valor canônico).
3. Redeploy (`deploy.sh` recusa `MOCK=true`). Em Configurações → Integrações → Google Agenda: cole **Client ID** e **Client Secret**, salve, use **Conectar / Autenticar** e autorize.
4. A UI mostra o redirect URI no formulário e em “Detalhes técnicos”.

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
