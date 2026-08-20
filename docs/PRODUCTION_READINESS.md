# Production readiness — Sonder Clinic

Checklist honesto para aptidão de produção. Atualizado após remessa **Release Candidate / estabilização final**.

Legenda: **GO** = pronto se configurado; **NO-GO** = bloqueia go-live; **PARTIAL** = funciona com ressalvas.

## Bloqueadores (NO-GO se ausente)

| Item | Status | Notas |
|------|--------|-------|
| Secrets JWT / `ENCRYPTION_MASTER_KEY` | **NO-GO** até trocar defaults | Fail-fast em `NODE_ENV=production` recusa startup com defaults |
| `DATABASE_URL` Postgres gerenciado | **NO-GO** | Não-localhost; backups e retenção obrigatórios |
| HTTPS + Traefik / TLS | **NO-GO** | ADR 0002; redes `traefik_public` |
| Migrations aplicadas (`db:deploy` / bootstrap) | **GO (fluxo)** | Swarm: serviço `migrate` + `infra/swarm/scripts/deploy.sh`. Nunca seed em prod |
| `COOKIE_SECURE=true` + HTTPS | **GO (stack)** | Fail-fast + `COOKIE_SECURE: "true"` no stack |
| `WEB_URL` HTTPS público | **GO (stack)** | Sem fallback localhost; e-mails/convites usam `WEB_URL` |
| Imagens obrigatórias (`API_IMAGE`/`WEB_IMAGE`/`WORKER_IMAGE`) | **GO (stack)** | Sem fallback `1.0.0`; preferir `sha-<commit>` |
| Setup inicial (`/setup`) | **GO (código)** | Primeiro admin sem seed; token no formulário; API exige `X-Setup-Token` |
| Storage MinIO/S3 com credenciais | **NO-GO** para uploads | Fail-fast recusa `STORAGE_DRIVER=local` |
| Redis (`QUEUE_DRIVER=redis` + `REDIS_URL`) | **NO-GO** em prod | Fail-fast + readiness |
| `CORS_ORIGIN` explícito | **NO-GO** em prod | Sem fallback localhost |
| SMTP real | **NO-GO** se reset, convites **ou envio manual EMAIL** forem requisito | Sem `SMTP_HOST` falha explicitamente |

## Operação (GO / PARTIAL)

| Item | Status | Notas |
|------|--------|-------|
| Imagens GHCR (`api`/`web`/`worker`) | **GO (código)** | Tag `vX.Y.Z` só após CI do workflow Release; `main` via `workflow_run` |
| Branch protection `main` exige CI | **PARTIAL** | Configurar no GitHub (Settings → Branches). O YAML do CI não ativa protection sozinho. Exemplo: `gh api repos/{owner}/{repo}/branches/main/protection` com `required_status_checks` apontando para o job `quality`. |
| Health liveness `/health` | **GO** | |
| Readiness `/api/v1/health/ready` | **GO (código)** | DB + Redis (prod) + storage |
| Swagger | **GO (código)** | Off por default em prod (`SWAGGER_ENABLED`) |
| Backups Postgres | **PARTIAL** | Processo externo |
| Monitoramento / OTEL | **GO** (código) / **PARTIAL** (ops) | |
| ClamAV | **GO** (adapter) / **PARTIAL** (ops) | |
| Outbox dead-letter | **PARTIAL** | Worker DLQ + API/UI |
| Seed em produção | **NO-GO** | Só desenvolvimento. Produção usa `/setup` |
| Bootstrap de database | **GO (código)** | Cria `sonder_clinic` se ausente (`DATABASE_ADMIN_URL`) + `migrate deploy` |
| Worker fail-fast | **GO (código)** | Mesmas exigências de DB/Redis/storage em produção |

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
2. `COOKIE_SECURE=true`, `WEB_URL` HTTPS, `CORS_ORIGIN`, `QUEUE_DRIVER=redis`, `REDIS_URL`, storage remoto.
3. Tag `vX.Y.Z` (workflow Release) ou `infra/swarm/scripts/deploy.sh`. Não rode `pnpm db:seed` em produção. Primeiro admin na página `/setup`.
4. MinIO/S3 + teste de upload.
5. SMTP; testar reset/convite/EMAIL.
6. Imagens `sha-<commit>` (não depender só de `latest`); Swarm; `/health` + `/health/ready`.
7. Backup Postgres (restore dry-run).
8. Desabilitar `*_MOCK` só com credencial real.
9. Google: OAuth + webhook HTTPS + auto-renew (preferir 1 worker replica).
10. Rodar `pnpm lint` / `typecheck` / `test` / `test:e2e` e anexar evidência.
11. Branch protection: main exige CI verde.

## Veredito

**Código:** instalação nova via bootstrap + `/setup` está no fluxo Swarm.  
**Go-live pleno:** ainda depende de secrets/HTTPS/Redis/S3/SMTP reais, backups e evidência de CI/E2E em staging. Passo a passo: `docs/FRESH_INSTALL.md`.
