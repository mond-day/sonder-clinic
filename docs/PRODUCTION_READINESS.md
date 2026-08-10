# Production readiness — Sonder Clinic

Checklist honesto para aptidão de produção. Atualizado após remessa **Release Candidate / estabilização final**.

Legenda: **GO** = pronto se configurado; **NO-GO** = bloqueia go-live; **PARTIAL** = funciona com ressalvas.

## Bloqueadores (NO-GO se ausente)

| Item | Status | Notas |
|------|--------|-------|
| Secrets JWT / `ENCRYPTION_MASTER_KEY` | **NO-GO** até trocar defaults | Fail-fast em `NODE_ENV=production` recusa startup com defaults |
| `DATABASE_URL` Postgres gerenciado | **NO-GO** | Não-localhost; backups e retenção obrigatórios |
| HTTPS + Traefik / TLS | **NO-GO** | ADR 0002; redes `traefik_public` |
| Migrations aplicadas (`db:deploy`) | **NO-GO** | Inclui `20260810020000_anamnesis_source_response` |
| `COOKIE_SECURE=true` + HTTPS | **NO-GO** | Fail-fast exige `COOKIE_SECURE=true` |
| Storage MinIO/S3 com credenciais | **NO-GO** para uploads | Fail-fast recusa `STORAGE_DRIVER=local` |
| Redis (`QUEUE_DRIVER=redis` + `REDIS_URL`) | **NO-GO** em prod | Fail-fast + readiness |
| `CORS_ORIGIN` explícito | **NO-GO** em prod | Sem fallback localhost |
| SMTP real | **NO-GO** se reset, convites **ou envio manual EMAIL** forem requisito | Sem `SMTP_HOST` falha explicitamente |

## Operação (GO / PARTIAL)

| Item | Status | Notas |
|------|--------|-------|
| Imagens GHCR (`api`/`web`/`worker`) | **GO (código)** | Só após CI verde (`workflow_run`) |
| Branch protection `main` exige CI | **PARTIAL** | Documentado; configurar no GitHub |
| Health liveness `/health` | **GO** | |
| Readiness `/api/v1/health/ready` | **GO (código)** | DB + Redis (prod) + storage |
| Swagger | **GO (código)** | Off por default em prod (`SWAGGER_ENABLED`) |
| Backups Postgres | **PARTIAL** | Processo externo |
| Monitoramento / OTEL | **GO** (código) / **PARTIAL** (ops) | |
| ClamAV | **GO** (adapter) / **PARTIAL** (ops) | |
| Outbox dead-letter | **PARTIAL** | Worker DLQ + API/UI |
| Seed em produção | **NO-GO** | Só desenvolvimento |

## Produto / compliance

| Item | Status | Notas |
|------|--------|-------|
| LGPD | **PARTIAL** | Políticas editáveis; DPO externo |
| Auditoria | **GO** | Inclui `anamnesis.update_draft_created` / `superseded` / `cancelled` |
| Multi-tenant | **GO** | `sourceResponseId` / publish / relatórios isolados por org |
| Anamnese lifecycle | **GO (código)** | Update não invalida origem; SUPERSEDED na finalize |
| Relatórios produção vs recebimento | **GO (código)** | `production-procedure` clínico; `receipt-procedure` financeiro |
| Document templates publish | **GO (código)** | Validate obrigatório no publish |
| Integrações externas | **GO (código)** / **PARTIAL (ops)** | Google watch renew com lease CAS |
| E2E Playwright | **PARTIAL** | Specs alinhados A–G; evidência CI pendente |

## Checklist pré-release operacional

1. Rotacionar secrets; validar `ENCRYPTION_MASTER_KEY` (64 hex ≠ example).
2. `COOKIE_SECURE=true`, `CORS_ORIGIN`, `QUEUE_DRIVER=redis`, `REDIS_URL`, storage remoto.
3. `pnpm db:deploy` (inclui `sourceResponseId`); smoke login admin.
4. MinIO/S3 + teste de upload.
5. SMTP; testar reset/convite/EMAIL.
6. Imagens `sha-<commit>` (não depender só de `latest`); Swarm; `/health` + `/health/ready`.
7. Backup Postgres (restore dry-run).
8. Desabilitar `*_MOCK` só com credencial real.
9. Google: OAuth + webhook HTTPS + auto-renew (preferir 1 worker replica).
10. Rodar `pnpm lint` / `typecheck` / `test` / `test:e2e` e anexar evidência.
11. Branch protection: main exige CI verde.

## Veredito

**Release Candidate (código):** gaps de estabilização fechados no monorepo.  
**Go-live pleno:** ainda **NO-GO** até secrets/HTTPS/Redis/S3/SMTP/migrations/backups + CI/E2E verdes em staging.
