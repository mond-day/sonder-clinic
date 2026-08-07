# Production readiness — Sonder Clinic

Checklist honesto para aptidão de produção. Atualizado após **QA P0 + Tratamentos + Documentos + P1/P2 (fatias A–J)**.

Legenda: **GO** = pronto se configurado; **NO-GO** = bloqueia go-live; **PARTIAL** = funciona com ressalvas.

## Bloqueadores (NO-GO se ausente)

| Item | Status | Notas |
|------|--------|-------|
| Secrets JWT / `ENCRYPTION_MASTER_KEY` | **NO-GO** até trocar defaults | Nunca usar valores de `.env.example` em prod |
| `DATABASE_URL` Postgres gerenciado | **NO-GO** | Backups e retenção obrigatórios |
| HTTPS + Traefik / TLS | **NO-GO** | ADR 0002; redes `traefik_public` |
| Migrations aplicadas (`db:deploy`) | **NO-GO** | Inclui migrations P0/tratamentos/documentos se ainda não aplicadas |
| `COOKIE_SECURE=true` + HTTPS | **NO-GO** | Cookies de sessão |
| Storage MinIO/S3 com credenciais | **NO-GO** para uploads | `STORAGE_DRIVER=minio\|s3` + endpoint/keys/bucket; anexos de tarefa também |
| SMTP real | **NO-GO** se reset, convites **ou envio manual EMAIL** forem requisito | Sem `SMTP_HOST` falha explicitamente (correto) |

## Operação (GO / PARTIAL)

| Item | Status | Notas |
|------|--------|-------|
| Imagens GHCR (`api`/`web`/`worker`) | **GO** | Workflow `release-images.yml` |
| Redis compartilhado (`QUEUE_DRIVER=redis`) | **PARTIAL** | Dev usa `memory`; prod deve usar Redis da `digital_network` |
| Healthchecks Swarm | **GO** se stack aplicada | `/health` inclui storage, AV e OTEL status |
| Backups Postgres | **PARTIAL** | Processo externo — documentar RPO/RTO no runbook |
| Monitoramento / OTEL | **GO** (código) / **PARTIAL** (ops) | SDK em `@sonder/observability` |
| ClamAV | **GO** (adapter) / **PARTIAL** (ops) | Sem daemon uploads ficam `PENDING` |
| Outbox dead-letter | **PARTIAL** | Worker marca DLQ; API + UI admin; `allowedHours` pode adiar eventos |
| Seed em produção | **NO-GO** | Seed é só desenvolvimento |

## Produto / compliance

| Item | Status | Notas |
|------|--------|-------|
| LGPD | **PARTIAL** | Políticas editáveis; DPO externo |
| Auditoria (`AuditEvent`) | **GO** em fluxos críticos | |
| Isolamento multi-tenant | **GO** | |
| Integrações externas | **PARTIAL** | Test-connection honesto; Google Calendar **PARTIAL** (A38) |
| Comunicação (canais/envio) | **PARTIAL** | Canais + envio manual; WhatsApp stub; SMTP GO se configurado |
| Certificado A1 | **PARTIAL** | Precisa PKCS#12 válido |
| Relatórios XLSX | **GO** (código) | ExcelJS real; UI exporta `.xlsx` |
| Recorrências financeiras | **GO** | |
| Convites SMTP | **GO** (código) / **NO-GO** ops sem SMTP | |
| Merge de pacientes | **PARTIAL** | Validar em staging |
| Documentos (exame/atestado/receita) | **GO** (código) | Editor EXAM_REQUEST entregue |
| Tarefas ricas | **PARTIAL** | Checklist + participantes + comentários + anexos; sem recorrência |
| Retornos `allowedHours` | **GO** (código worker) | `{}` = 24/7; deferral se todas fora da janela |
| E2E Playwright | **PARTIAL** | Novos fluxos ainda manuais |

## Checklist pré-release operacional

1. Rotacionar secrets; validar `ENCRYPTION_MASTER_KEY` (64 hex).
2. `pnpm db:deploy`; smoke login admin.
3. MinIO/S3 + teste de upload (incl. anexo de tarefa).
4. Configurar SMTP; testar reset, convite e envio manual EMAIL.
5. Imagens no Swarm; `/health`.
6. Backup Postgres (restore dry-run).
7. Desabilitar `*_MOCK=true` só com credencial real.
8. (Opcional) ClamAV / OTEL.
9. Revisar dead-letters e eventos adiados por `allowedHours`.
10. Revisar `docs/SECURITY.md` e ADR 0002.
11. Não marcar Google Calendar como GO até OAuth + sync.

## Veredito

Piloto controlado avançou (P0 + tratamentos + documentos + P1/P2 A–J). **Ainda não é go-live pleno:** secrets/HTTPS/storage/SMTP/migrations/backups bloqueiam ops; OAuth Calendar e WhatsApp outbound permanecem PARTIAL. Odontograma 3D e áudio/transcrição fora de contrato.

**Backlog residual P1/P2 do QA desta rodada foi fechado no código** (com PARTIALs honestos documentados).
