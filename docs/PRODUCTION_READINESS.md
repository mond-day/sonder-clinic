# Production readiness — Sonder Clinic

Checklist honesto para aptidão de produção. Atualizado na **1.1.6**.

Legenda: **GO** = pronto se configurado; **NO-GO** = bloqueia go-live; **PARTIAL** = funciona com ressalvas.

## Bloqueadores (NO-GO se ausente)

| Item | Status | Notas |
|------|--------|-------|
| Secrets JWT / `ENCRYPTION_MASTER_KEY` | **NO-GO** até trocar defaults | Nunca usar valores de `.env.example` em prod |
| `DATABASE_URL` Postgres gerenciado | **NO-GO** | Backups e retenção obrigatórios |
| HTTPS + Traefik / TLS | **NO-GO** | ADR 0002; redes `traefik_public` |
| Migrations aplicadas (`db:deploy`) | **NO-GO** | Sem migrate no boot cego |
| `COOKIE_SECURE=true` + HTTPS | **NO-GO** | Cookies de sessão |
| Storage MinIO/S3 com credenciais | **NO-GO** para uploads | `STORAGE_DRIVER=minio\|s3` + endpoint/keys/bucket |
| SMTP real | **NO-GO** se password reset for requisito | Sem `SMTP_HOST` o fluxo falha explicitamente (correto) |

## Operação (GO / PARTIAL)

| Item | Status | Notas |
|------|--------|-------|
| Imagens GHCR (`api`/`web`/`worker`) | **GO** | Workflow `release-images.yml` |
| Redis compartilhado (`QUEUE_DRIVER=redis`) | **PARTIAL** | Dev usa `memory`; prod deve usar Redis da `digital_network` |
| Healthchecks Swarm | **GO** se stack aplicada | `/health` inclui storage, AV e OTEL status |
| Backups Postgres | **PARTIAL** | Processo externo — documentar RPO/RTO no runbook |
| Monitoramento / OTEL | **GO** (código) / **PARTIAL** (ops) | SDK em `@sonder/observability`; ligar `OTEL_ENABLED=true` + collector se desejado |
| ClamAV | **GO** (adapter) / **PARTIAL** (ops) | `AV_DRIVER=clamav` + daemon; sem daemon uploads ficam `PENDING` |
| Seed em produção | **NO-GO** | Seed é só desenvolvimento |

## Produto / compliance

| Item | Status | Notas |
|------|--------|-------|
| LGPD (políticas editáveis + consentimento) | **PARTIAL** | Textos configuráveis; DPO/processos externos fora do app |
| Auditoria (`AuditEvent`) | **GO** em fluxos críticos | Branding, certificado, tags, unidades |
| Isolamento multi-tenant (org no JWT) | **GO** | |
| Integrações (Evolution, Nibo, etc.) | **PARTIAL** | Desligadas sem credencial; configurar só o necessário |
| Certificado A1 | **PARTIAL** | Upload/storage OK; precisa PKCS#12 válido da clínica |
| Recorrências financeiras | **GO** | API + UI + worker |
| E2E Playwright | **PARTIAL** | CI roda E2E; coberturas novas (recorrências/AV/OTEL) manuais |

## Checklist pré-release operacional

1. Rotacionar todos os secrets; validar `ENCRYPTION_MASTER_KEY` (64 hex).
2. `pnpm db:deploy` no ambiente alvo; smoke login admin.
3. Confirmar MinIO bucket + policy privada; testar upload branding (falha se mal configurado).
4. Configurar SMTP e testar “Esqueci minha senha”.
5. Apontar imagens `v1.1.6` no Swarm; health `/health` API e web.
6. Backup Postgres verificado (restore dry-run).
7. Desabilitar `*_MOCK=true` apenas para provedores com credencial real.
8. (Opcional) ClamAV: `AV_DRIVER=clamav`, `CLAMAV_HOST`/`CLAMAV_PORT`.
9. (Opcional) OTEL: `OTEL_ENABLED=true`, `OTEL_EXPORTER_OTLP_ENDPOINT`.
10. Revisar `docs/SECURITY.md` e ADR 0002.

## Veredito 1.1.6

Residuais de **código** da linha 1.1.x (recorrências, ClamAV operable, OTEL) estão fechados com evidência no repositório. O produto está apto a **piloto controlado** após secrets, HTTPS, storage, SMTP (se reset), migrations e backups. Itens PARTIAL restantes são **ops/infra externos** ou protótipos explícitos (odontograma 3D) — não código faltando nestes contratos.
