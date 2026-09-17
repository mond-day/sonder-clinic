# Segurança

## Controles implementados

- Senhas com Argon2id; política mínima de 10 caracteres com maiúscula, minúscula e número (criação/reset/convite/setup).
- Refresh tokens aleatórios armazenados somente como SHA-256, rotativos e revogáveis.
- Bloqueio de usuário revoga todas as sessions; refresh e AuthGuard recusam `status !== ACTIVE` (cache ~30s).
- Cookies HttpOnly, `SameSite=Lax` e `Secure` em produção; logout limpa cookies com os mesmos atributos.
- CSRF: Origin/Referer ∈ `CORS_ORIGIN`/`WEB_URL` + double-submit `csrf_token` / `X-CSRF-Token` em mutações cookie. Token também no header de resposta `X-CSRF-Token` (CORS `exposedHeaders`) para o front cross-origin (app.* / api.*) cachear — `document.cookie` não vê cookie host-only da API.
- Rate limiting (Redis em prod, memória em dev) para login, forgot/reset, convite, setup, links públicos e webhooks.
- `trust proxy` em produção (Traefik); Helmet na API; headers de segurança no Next.js.
- Escopo de organização derivado do JWT; clínicas filtradas por `ProfessionalClinic` quando o usuário tem vínculo (admin/recepção sem vínculo permanece org-wide).
- DTOs HTTP com whitelist e rejeição de campos desconhecidos.
- Envelope encryption v2 (DEK + AES-256-GCM) para credenciais, certificados A1 e API keys; decrypt aceita v1 legado.
- Docker secrets para JWT, encryption, S3, `DATABASE_URL` e `INITIAL_SETUP_TOKEN`.
- Setup inicial: token informado no formulário; API exige `X-Setup-Token`; Next não injeta o secret.
- Webhook AbacatePay: HMAC obrigatório (sem segredo na query). Google Calendar: token do canal obrigatório.
- Import Nibo: API Key só via conexão criptografada; respostas de erro não ecoam o token; pull create/update por `externalId` (cancelados locais preservados); push soft-fail no outbox; logs estruturados no worker sem credenciais.
- Google Calendar OAuth: `GOOGLE_REDIRECT_URI` deve ser HTTPS público idêntico ao cadastrado no Google Cloud Console (`…/api/v1/integrations/google/callback`); client secret só em env/conexão criptografada.
- Upload clínico: allowlist MIME; download só com antivírus `CLEAN`; S3 com `ServerSideEncryption: AES256`.
- Exclusion constraints PostgreSQL (`btree_gist`) para sobreposição de profissional/cadeira na agenda.
- Credenciais de integrações somente por variáveis de ambiente / secrets.
- Registros clínicos, tokens e segredos não devem ser escritos em logs.

## Antes de produção (ops)

1. Trocar todos os segredos de desenvolvimento e ativar `COOKIE_SECURE=true` (fail-fast + stack).
2. Configurar branch protection da `main` no GitHub (exige CI verde) — ação no repositório, não no YAML.
3. Rodar análise de dependências no CI (`pnpm audit --prod`); revisar PRs do Dependabot. Vulnerabilidades transitivas do Prisma podem aparecer até upgrade do cliente — o job de audit não bloqueia o merge sozinho.
4. Backup Postgres + teste de restauração; ClamAV no Swarm se uploads clínicos forem usados (`AV_DRIVER=clamav`).
5. Validar LGPD/DPO externo e políticas editáveis.

O `.env` não deve ser versionado. O arquivo `.env.example` contém apenas valores locais e placeholders.
