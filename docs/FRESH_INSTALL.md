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

O token `INITIAL_SETUP_TOKEN` fica **só na API** (`.env` / secret). A página `/setup` pede esse valor no formulário; o Next.js **não** injeta o token sozinho.

## O PostgreSQL precisa ter o database criado antes?

Não, no fluxo suportado. No `.env` da VPS:

- `DATABASE_URL` — usuário runtime e database da aplicação (ex.: `sonder_clinic`)
- `DATABASE_ADMIN_URL` (opcional) — conexão no database de manutenção (`postgres`) com permissão para `CREATE DATABASE`
- `INITIAL_SETUP_TOKEN` — secret forte na API; cole o mesmo valor no campo de token de `/setup`

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

Somente `prisma migrate deploy` (nunca `migrate dev` nem seed), no serviço `migrate` durante o `deploy.sh`.

`deploy.sh` recusa `WEB_URL` localhost/HTTP e imagens não definidas. Depois do `docker stack deploy`, espera o serviço `migrate` registrar bootstrap completo. Só então o release é considerado concluído.

API e worker podem subir em paralelo, mas:

- Traefik só envia tráfego à API com `/api/v1/health/ready` (PostgreSQL + Redis + storage)
- o healthcheck Docker da API permanece em `/api/v1/health` (liveness), para um Postgres lento não virar restart loop
- o worker recusa startup em produção sem `DATABASE_URL`, Redis e storage remoto

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

`APP_URL` foi removido do stack; use `WEB_URL`.

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
