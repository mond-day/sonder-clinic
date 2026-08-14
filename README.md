# Sonder Clinic

ERP odontológico interno, multi‑clínica, construído como monorepo TypeScript (Next.js + NestJS + worker + PostgreSQL/Prisma). Cobre a operação de uma clínica de ponta a ponta: agenda, pacientes, prontuário clínico, odontograma, planos de tratamento, documentos, financeiro, comissões, comunicação, integrações e configurações.

> Versão atual: **1.2.2**. Este é um sistema interno; o `.env` de desenvolvimento usa segredos fictícios e dados de demonstração.

---

## Índice

- [Parte 1 — Para desenvolvedores](#parte-1--para-desenvolvedores)
  - [Arquitetura](#arquitetura)
  - [Stack e versões](#stack-e-versões)
  - [Pré‑requisitos](#pré-requisitos)
  - [Setup local passo a passo](#setup-local-passo-a-passo)
  - [Variáveis de ambiente](#variáveis-de-ambiente)
  - [Scripts disponíveis](#scripts-disponíveis)
  - [Estrutura de pastas](#estrutura-de-pastas)
  - [Autenticação, multi‑clínica e RBAC](#autenticação-multi-clínica-e-rbac)
  - [Módulos e fluxos principais](#módulos-e-fluxos-principais)
  - [Integrações externas](#integrações-externas)
  - [Fila, storage e antivírus](#fila-storage-e-antivírus)
  - [Produção: Swarm, Traefik e imagens](#produção-swarm-traefik-e-imagens)
  - [CI/CD e release](#cicd-e-release)
  - [Testes, typecheck e build](#testes-typecheck-e-build)
  - [Documentação complementar](#documentação-complementar)
- [Parte 2 — Para operadores da clínica](#parte-2--para-operadores-da-clínica)
  - [O que é o Sonder Clinic](#o-que-é-o-sonder-clinic)
  - [Como acessar e entrar](#como-acessar-e-entrar)
  - [Os módulos do dia a dia](#os-módulos-do-dia-a-dia)
  - [Fluxos típicos](#fluxos-típicos)
  - [Configurações, integrações e branding](#configurações-integrações-e-branding)
  - [Políticas legais](#políticas-legais)

---

# Parte 1 — Para desenvolvedores

## Arquitetura

Monorepo gerenciado com **pnpm workspaces** + **Turborepo**. Quatro unidades principais compartilham um único schema de banco e tipos:

```
┌────────────┐        HTTP/JSON (cookies HttpOnly)        ┌──────────────┐
│  web        │  ───────────────────────────────────────▶ │  api         │
│  Next.js 16 │   /api/v1  (login, dados, mutações)        │  NestJS 11   │
└────────────┘                                             └──────┬───────┘
                                                                  │ Prisma
                                                                  ▼
                                                          ┌──────────────┐
┌────────────┐   lê/atualiza OutboxEvent (polling)         │ PostgreSQL 16│
│  worker     │ ◀────────────────────────────────────────▶ │  (Prisma)    │
│  tsx        │                                             └──────────────┘
└────────────┘
```

- **`apps/web`** — front-end Next.js (App Router). Consome a API autenticada, mantém sessão via cookies HttpOnly e organiza a operação em módulos.
- **`apps/api`** — API NestJS com prefixo global `/api/v1`, Swagger em `/docs`, validação por DTO (whitelist) e RBAC por permissão.
- **`apps/worker`** — processo de background que consome a tabela `OutboxEvent` (padrão *transactional outbox*) por polling. Em dev processa localmente; em produção despacha para adapters reais via fila Redis.
- **`packages/database`** — Prisma schema, client, migrações e seed. Fonte única do modelo de dados; importado como `@sonder/database`.
- **`packages/storage`** — adapters de storage (local/MinIO/S3) e antivírus ClamAV (INSTREAM).
- **`packages/observability`** — OpenTelemetry opcional (`OTEL_ENABLED`).
- **`packages/typescript-config`** — configs TS compartilhadas.

O escopo de organização (`organizationId`) é sempre derivado do JWT, nunca de parâmetro do cliente — base do isolamento multi‑tenant.

## Stack e versões

| Camada | Tecnologia |
|--------|------------|
| Front-end | Next.js 16 (Turbopack), React 19, react-hook-form, Zod, lucide-react, date-fns |
| Back-end | NestJS 11, Express 5, @nestjs/jwt, @nestjs/swagger, class-validator/transformer, Zod |
| Dados | PostgreSQL 16 + Prisma 6 |
| Auth/cripto | Argon2id, JWT (access + refresh rotativo), AES‑256‑GCM para credenciais |
| Worker | Node + tsx (watch em dev) |
| Tooling | pnpm 9.15, Turborepo, TypeScript 5.7+, Prettier, Vitest |
| Runtime | Node.js >= 24, Corepack |

## Pré‑requisitos

- **Node.js 24+** e **Corepack** habilitado (`corepack enable`). O pnpm é resolvido automaticamente pela versão fixada em `packageManager`.
- **PostgreSQL 16** acessível em `localhost:5432`. Duas formas:
  - **Docker** (recomendado): `infra/docker/docker-compose.dev.yml` sobe um Postgres 16 já configurado.
  - **Postgres local**: crie o papel/banco manualmente (veja abaixo). Não é necessário Docker.
- **Redis não é necessário em desenvolvimento** — a fila roda em modo `memory`. Redis só entra em produção.

## Setup local passo a passo

### Opção A — Script tudo‑em‑um (com Docker)

```bash
corepack enable
./script/dev.command      # macOS/Linux
# Windows: script\dev.exe  no Prompt de Comando
```

O script sobe o Postgres via Docker Compose, instala dependências, gera o Prisma Client, aplica migrações, roda o seed e inicia `web`, `api` e `worker` em paralelo.

### Opção B — Passo a passo (com ou sem Docker)

```bash
# 1. Dependências
corepack enable
corepack pnpm install

# 2. Ambiente
cp .env.example .env         # ajuste se necessário

# 3. Banco de dados
#   (com Docker)
docker compose -f infra/docker/docker-compose.dev.yml up -d
#   (sem Docker — Postgres local já instalado)
createuser sonder --pwprompt          # senha: senha123
createdb sonder_clinic -O sonder

# 4. Prisma
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed

# 5. Subir os serviços (todos juntos)
corepack pnpm dev
#   ou individualmente:
corepack pnpm dev:api
corepack pnpm dev:web
corepack pnpm dev:worker
```

Serviços em dev:

| Serviço | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API (base) | http://localhost:4000/api/v1 |
| Swagger | http://localhost:4000/docs |
| Health | http://localhost:4000/api/v1/health |

Login de demonstração após o seed:

- **E‑mail:** `admin@sonder.local`
- **Senha:** `Sonder@123`

> O worker lê `DATABASE_URL` diretamente do ambiente (via Prisma). Ao iniciá‑lo de forma isolada em um shell que não carregou o `.env`, exporte as variáveis antes (`set -a && source .env && set +a`) ou use `./script/dev.command` / `pnpm dev`, que já cuidam disso.

## Variáveis de ambiente

O arquivo `.env.example` documenta todas as variáveis; nenhum segredo real é versionado. Principais grupos:

| Grupo | Variáveis | Observação |
|-------|-----------|------------|
| Runtime | `NODE_ENV`, `TZ` | `TZ=America/Cuiaba` (UTC no banco, fuso na apresentação) |
| Apps | `WEB_URL`, `API_URL`, `API_PORT`, `CORS_ORIGIN`, `APP_HOST`, `API_HOST` | portas 3000/4000 em dev |
| Branding | `BRAND_NAME`, `BRAND_SUBTITLE`, `BRAND_PRIMARY_COLOR`, `BRAND_LOGO_URL`, `BRAND_FAVICON_URL` | fallback; settings por clínica sobrescrevem |
| Banco | `DATABASE_URL` | `postgresql://sonder:senha123@localhost:5432/sonder_clinic?schema=public` em dev |
| Fila | `QUEUE_DRIVER`, `REDIS_URL`, `WORKER_EMBEDDED` | `memory` em dev, `redis` em prod |
| Auth | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `COOKIE_SECURE` | segredos de dev são placeholders; TTL access 15m / refresh 30d |
| Cripto | `ENCRYPTION_MASTER_KEY` | 32 bytes hex para AES‑256‑GCM |
| Storage | `STORAGE_DRIVER`, `STORAGE_LOCAL_PATH`, `S3_*` | `local` em dev, `s3`/MinIO em prod |
| Antivírus | `AV_DRIVER`, `CLAMAV_HOST`, `CLAMAV_PORT` | `stub` em dev; `clamav` + host em prod opcional |
| Integrações | `NIBO_*`, `ABACATEPAY_*`, `EVOLUTION_*`, `CHATWOOT_*`, `GOOGLE_*`, `OPENAI_*`, `AI_PROVIDER`, `INTEGRATION_SCOPE_DEFAULT` | `*_MOCK=true` roda com stubs, sem credenciais reais |
| Certificado A1 | `A1_CERTIFICATE_PATH`, `A1_PASSWORD_FILE` | nunca versionar; usar Docker secrets em prod |
| Import | `CODENTAL_IMPORT_ENABLED`, `CODENTAL_IMPORT_PATH` | desabilitado até os arquivos serem fornecidos |
| Observabilidade | `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `LOG_LEVEL` | SDK real; desligado por padrão |

> **Segurança:** `.env` nunca deve ir para o Git. Antes de produção, troque **todos** os segredos, habilite `COOKIE_SECURE=true` e siga o checklist em `docs/SECURITY.md`.

## Scripts disponíveis

Na raiz (`package.json`):

| Script | Ação |
|--------|------|
| `pnpm dev` | Sobe `web`, `api` e `worker` em paralelo |
| `pnpm dev:web` / `dev:api` / `dev:worker` | Sobe um app específico |
| `pnpm build` | Build de todos os pacotes |
| `pnpm lint` | `tsc --noEmit` em todos os pacotes |
| `pnpm typecheck` | Verificação de tipos |
| `pnpm test` | Testes (Vitest; usa `--passWithNoTests` onde ainda não há suíte) |
| `pnpm test:integration` | Testes de integração |
| `pnpm db:generate` | `prisma generate` |
| `pnpm db:migrate` | `prisma migrate dev` |
| `pnpm db:seed` | Popula dados de demonstração |
| `pnpm db:reset` | Recria o banco (destrutivo) |
| `pnpm format` | Prettier |

Também disponível: `./script/dev.command` (setup + subida completa em um comando).

## Estrutura de pastas

```
sonder-clinic/
├── apps/
│   ├── api/            # NestJS — API REST /api/v1 + Swagger
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── common/          # guards, decorators, utilitários
│   │       └── modules/         # auth, patients, scheduling, clinical,
│   │                            # operations, integrations, settings
│   ├── web/            # Next.js — App Router
│   │   └── src/
│   │       ├── app/             # rotas (login, [module], legal, dashboard)
│   │       ├── components/      # app-shell, module-view, providers de auth/seleção
│   │       ├── features/
│   │       ├── lib/             # cliente HTTP da API
│   │       └── providers/
│   └── worker/         # processador de OutboxEvent
├── packages/
│   ├── database/       # Prisma schema, client, migrações, seed
│   ├── storage/        # local/MinIO/S3 + ClamAV
│   ├── observability/  # OpenTelemetry opcional
│   └── typescript-config/
├── infra/
│   ├── docker/docker-compose.dev.yml   # Postgres 16 para dev
│   └── swarm/stack.production.yml      # deploy Docker Swarm + Traefik
├── docs/               # documentação técnica e de produto
├── script/dev.command  # setup + subida do ambiente de dev
├── turbo.json          # pipeline Turborepo
└── pnpm-workspace.yaml
```

## Autenticação, multi‑clínica e RBAC

- **Login por e‑mail/senha** com hash **Argon2id**. Emite **JWT de acesso** (curta duração) e **refresh token** rotativo. O refresh é armazenado apenas como **SHA‑256**, é revogável e rotacionado a cada uso.
- **Cookies HttpOnly** (`access_token` e `refresh_token`), `SameSite=Lax`, `Secure` configurável (`COOKIE_SECURE`). O front-end renova o access token automaticamente em respostas `401` e trata sessão expirada.
- **Multi‑clínica:** uma organização possui clínicas e unidades. O usuário escolhe a clínica ativa no header (persistida em `localStorage`) e ela é propagada para todos os módulos. O `organizationId` vem do JWT, garantindo isolamento entre organizações.
- **RBAC por permissão:** `PermissionsGuard` + decorator `@RequirePermissions` protegem os endpoints sensíveis. As permissões (ex.: `patient.create`, `appointment.cancel`, `financial.refund`, `integration.manage`) são atribuídas a papéis; o seed cria o papel `ADMIN` com todas.

## Módulos e fluxos principais

A API expõe estes conjuntos de recursos (todos sob `/api/v1`, documentados no Swagger):

| Módulo | Recursos |
|--------|----------|
| **Auth** | login, refresh, logout |
| **Pacientes** | cadastro, edição, alertas clínicos, responsáveis/guardiões, menores de idade |
| **Agenda** | consultas por profissional e cadeira; validação de conflito no servidor; criar, remarcar, cancelar |
| **Clínico** | prontuário, evoluções assináveis, correções por adendo, notas privadas, anamnese (templates + respostas + assinatura + alertas), odontograma FDI versionado |
| **Tratamentos** | procedimentos, planos, aprovação (inclusive parcial), sessões |
| **Documentos** | modelos, geração, assinatura imutável, validação pública por código |
| **Financeiro** | recebíveis, pagamentos idempotentes, estornos, conciliação, outbox de eventos |
| **Comissões** | regras versionadas, eventos por competência |
| **Comunicação** | entregas (deliveries) por canal e status |
| **Relatórios** | resumos clínicos, operacionais e financeiros |
| **Prescrição assistida** | sugestão via OpenAI (mock em dev), com revisão obrigatória |
| **Integrações/Settings** | conexões externas, branding e documentos legais por clínica |

> **Honestidade sobre o status:** a UI cobre mutações principais (pacientes, agenda, evolução, odontograma, títulos/recebimentos, recorrências, settings, usuários, unidades/cadeiras, comissões por competência e regras de retorno automático). Odontograma 3D permanece protótipo. Relatórios têm resumo real; exportação CSV/filtros avançados são parciais. Mapa atual: `docs/IMPLEMENTATION_STATUS.md`. Checklist prod: `docs/PRODUCTION_READINESS.md`.

## Integrações externas

As credenciais ficam **criptografadas (AES‑256‑GCM)**, são **mascaradas na leitura** e toda alteração é **auditada**. Cada provider tem dois modos:

- **Env bootstrap:** configuração inicial por variáveis de ambiente (`*_MOCK=true` roda com stubs, sem credenciais reais).
- **UI Configurações → Integrações:** credenciais enviadas em campos de senha, persistidas criptografadas; a API só devolve valores mascarados.

| Provider | Uso | Chaves principais |
|----------|-----|-------------------|
| **Nibo** | financeiro / contábil | header `ApiToken` (`NIBO_API_TOKEN`) |
| **AbacatePay** | pagamentos (API v2) | `ABACATEPAY_API_KEY`, webhook HMAC (`ABACATEPAY_WEBHOOK_SECRET`) |
| **Evolution** | mensageria WhatsApp (API v2) | `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY` |
| **Chatwoot** | atendimento | `CHATWOOT_API_ACCESS_TOKEN`, `CHATWOOT_ACCOUNT_ID` |
| **Google Calendar** | agenda (OAuth — parcial) | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` |
| **OpenAI** | prescrição assistida | `OPENAI_API_KEY`, `OPENAI_MODEL` |

## Fila, storage e antivírus

- **Fila:** `QUEUE_DRIVER=memory` em desenvolvimento (sem Redis). O worker faz polling da `OutboxEvent`. Em produção, `QUEUE_DRIVER=redis` e o worker despacha para os adapters reais (Evolution, Chatwoot, etc.).
- **Storage:** `local` em dev (`.data/storage`); `s3`/MinIO em produção.
- **Antivírus:** `stub`/`disabled` em dev (não marca CLEAN); `AV_DRIVER=clamav` + `CLAMAV_HOST` usa INSTREAM TCP real. Sem daemon → `PENDING`. Infectado rejeita upload.
- **Observabilidade:** `@sonder/observability` — `OTEL_ENABLED=true` ativa SDK (console ou OTLP). Status em `/api/v1/health`.

## Produção: Swarm, Traefik e imagens

Deploy via **Docker Swarm** em `infra/swarm/stack.production.yml`:

- Serviços `web`, `api` e `worker` com healthchecks, limites/reservas de CPU/memória e `restart_policy`.
- Redes **externas** `traefik_public` (borda/TLS) e `digital_network` (interna). Redis e MinIO são serviços **já existentes** — não sobem nesta stack.
- **Traefik** faz roteamento por host com TLS (Let's Encrypt): `web` em `app.sonder.clinic` (porta 3000), `api` em `api.sonder.clinic` (porta 4000). Hosts configuráveis por env (`APP_HOST`, `API_HOST`).
- Segredos via **Docker secrets** externos: `jwt_access_secret`, `jwt_refresh_secret`, `encryption_master_key`, `s3_access_key`, `s3_secret_key`.

Imagens publicadas no **GHCR** (`ghcr.io/mond-day`), tag padrão **1.2.2**:

- `ghcr.io/mond-day/sonder-clinic-api`
- `ghcr.io/mond-day/sonder-clinic-web`
- `ghcr.io/mond-day/sonder-clinic-worker`

## CI/CD e release

- **CI** (`.github/workflows/ci.yml`): em PR e push em `main`/`master` roda `install → prisma generate → typecheck → test → build` (Node 24, pnpm 9.15).
- **Release de imagens** (`.github/workflows/release-images.yml`): ao enviar uma tag `vX.Y.Z`, constrói as três imagens multi‑stage e publica no GHCR (tags `X.Y.Z`, `X.Y`, `latest`, `sha-<gitsha>`). Push em `main` sem tag gera `0.0.0-sha.<sha>` sem sobrescrever `latest`.

Passos de release (detalhes em `docs/RELEASE.md`):

```bash
# 1. Atualize a versão nos package.json (root + apps + packages)
# 2. Commit
git tag -a v1.2.2 -m "Release 1.2.2"
git push origin main
git push origin v1.2.2
# 3. Atualize WEB_IMAGE/API_IMAGE/WORKER_IMAGE no stack de produção
```

## Testes, typecheck e build

```bash
corepack pnpm typecheck   # tipos em todos os pacotes
corepack pnpm test        # Vitest (--passWithNoTests onde ainda não há suíte)
corepack pnpm build       # build de todos os pacotes
```

O `web` ainda não possui testes automatizados. A qualidade atual é validada por typecheck, testes de API e smoke tests autenticados (criação/edição de paciente, agenda com conflito/remarcação/cancelamento, evolução, odontograma, título/recebimento, settings e credencial mascarada).

## Documentação complementar

- `docs/README.md` — índice canônico.
- `docs/AGENTS.md` — arquitetura, convenções, env e como rodar.
- `docs/IMPLEMENTATION_STATUS.md` — o que está pronto e residual honesto.
- `docs/PRODUCTION_READINESS.md` — checklist go/no-go de produção.
- `docs/RELEASE.md` — versionamento, imagens e processo de release.
- `docs/SECURITY.md` — controles de segurança.
- `docs/api/workspace-contracts.md` — contratos HTTP do workspace.
- `docs/archive/` — specs históricas (não são fonte de verdade).
- `docs/ASSUMPTIONS.md` — decisões de produto.

Repositório: https://github.com/mond-day/sonder-clinic

---

# Parte 2 — Para operadores da clínica

## O que é o Sonder Clinic

O Sonder Clinic é o sistema de gestão da clínica odontológica. Em um só lugar você:

- Marca e acompanha **consultas** por profissional e cadeira.
- Mantém o **cadastro dos pacientes**, com alertas de saúde e responsáveis de menores.
- Registra o **prontuário** e a **evolução** de cada atendimento, além do **odontograma** (mapa dos dentes).
- Monta **planos de tratamento** e emite **documentos** (com assinatura e validação por código).
- Controla o **financeiro** (cobranças, recebimentos) e as **comissões** dos profissionais.
- Acompanha a **comunicação** com o paciente (mensagens/entregas).
- Ajusta **configurações**, **integrações** e a **identidade visual** da clínica.

## Como acessar e entrar

- **Em desenvolvimento/teste:** abra **http://localhost:3000** no navegador.
- **Em produção:** o endereço padrão é **https://app.sonder.clinic** (pode ser personalizado pela equipe técnica).

**Login de demonstração (apenas ambiente de desenvolvimento):**

- E‑mail: `admin@sonder.local`
- Senha: `Sonder@123`

> Essas credenciais servem só para testes locais com dados fictícios. Em produção, cada pessoa recebe um usuário próprio; nunca use a conta de demonstração em ambiente real.

No topo da tela há o **seletor de clínica** — escolha a unidade em que está trabalhando; ele vale para todos os módulos.

## Os módulos do dia a dia

| Módulo | Para que serve |
|--------|----------------|
| **Visão geral** | Painel com os principais indicadores da clínica |
| **Agenda** | Consultas do dia por profissional e cadeira; marcar, remarcar e cancelar |
| **Pacientes** | Cadastro, contato, alertas clínicos e responsáveis |
| **Tratamentos e prontuário** | Planos de tratamento, evoluções clínicas e odontograma do paciente |
| **Documentos** | Modelos, documentos gerados e assinaturas |
| **Financeiro** | Cobranças (recebíveis), recebimentos e situação de pagamento |
| **Comissões** | Regras de comissão dos profissionais |
| **Comunicação** | Mensagens enviadas ao paciente e seus status |
| **Relatórios** | Resumos clínicos, operacionais e financeiros |
| **Configurações** | Integrações, identidade visual (branding) e documentos legais |

## Fluxos típicos

1. **Agendar uma consulta:** selecione a clínica → **Agenda** → nova consulta, escolhendo paciente, profissional, cadeira e horário. O sistema avisa se houver conflito de horário/cadeira.
2. **Cadastrar/atualizar paciente:** **Pacientes** → novo (ou editar). Para menores, informe o responsável. Alertas clínicos ficam visíveis no cadastro.
3. **Atender e registrar evolução:** escolha o paciente em **Tratamentos e prontuário** → registre a evolução do atendimento; o **odontograma** guarda o histórico dos dentes por versão.
4. **Cobrar o paciente:** **Financeiro** → crie o título (cobrança) e registre o recebimento quando pago.
5. **Emitir documento:** **Documentos** → gere a partir de um modelo; documentos assinados ficam imutáveis e podem ser validados por um código público.
6. **Acompanhar comunicação:** **Comunicação** → veja o status das mensagens enviadas (entregue, falha, etc.).

> Alguns fluxos avançados (aprovar/executar plano, assinar evoluções e documentos, estornos, fechamento de comissões) já existem no sistema, mas ainda estão ganhando telas dedicadas. Em caso de dúvida sobre um passo que não aparece na tela, fale com a equipe técnica.

## Configurações, integrações e branding

Em **Configurações → Integrações** você conecta serviços externos e ajusta a clínica:

- **Nibo** (financeiro/contábil), **AbacatePay** (pagamentos), **Evolution** (WhatsApp), **Chatwoot** (atendimento), **Google Calendar** e **OpenAI** (apoio a prescrições).
- As **senhas e chaves são protegidas**: você digita a credencial, o sistema a guarda de forma criptografada e só mostra os valores **mascarados**. Toda alteração fica registrada.
- **Branding:** nome, subtítulo, cor principal e logotipo da clínica.

## Políticas legais

O sistema disponibiliza as políticas oficiais da clínica, versionadas:

- **Política de Privacidade** — `/legal/privacidade`
- **Termos de Uso** — `/legal/uso`
- **Termo de Consentimento (LGPD)** — `/legal/consentimento`

Esses documentos podem ser ajustados por clínica em **Configurações**. Dúvidas sobre privacidade: `privacidade@sonder.clinic` (configurável).
