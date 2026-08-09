# Production readiness — Sonder Clinic

Checklist honesto para aptidão de produção. Atualizado após **última milha** (webhook Google Calendar + editores Termo/Encaminhamento + UX).

Legenda: **GO** = pronto se configurado; **NO-GO** = bloqueia go-live; **PARTIAL** = funciona com ressalvas.

## Bloqueadores (NO-GO se ausente)

| Item | Status | Notas |
|------|--------|-------|
| Secrets JWT / `ENCRYPTION_MASTER_KEY` | **NO-GO** até trocar defaults | Nunca usar valores de `.env.example` em prod |
| `DATABASE_URL` Postgres gerenciado | **NO-GO** | Backups e retenção obrigatórios |
| HTTPS + Traefik / TLS | **NO-GO** | ADR 0002; redes `traefik_public` |
| Migrations aplicadas (`db:deploy`) | **NO-GO** | Inclui Fatia 3 + `20260809180000_fatia4_google_calendar_sync` |
| `COOKIE_SECURE=true` + HTTPS | **NO-GO** | Cookies de sessão |
| Storage MinIO/S3 com credenciais | **NO-GO** para uploads | `STORAGE_DRIVER=minio\|s3` + endpoint/keys/bucket |
| SMTP real | **NO-GO** se reset, convites **ou envio manual EMAIL** forem requisito | Sem `SMTP_HOST` falha explicitamente |

## Operação (GO / PARTIAL)

| Item | Status | Notas |
|------|--------|-------|
| Imagens GHCR (`api`/`web`/`worker`) | **GO** | Workflow `release-images.yml` |
| Redis compartilhado (`QUEUE_DRIVER=redis`) | **PARTIAL** | Dev usa `memory`; prod deve usar Redis |
| Healthchecks Swarm | **GO** se stack aplicada | |
| Backups Postgres | **PARTIAL** | Processo externo |
| Monitoramento / OTEL | **GO** (código) / **PARTIAL** (ops) | |
| ClamAV | **GO** (adapter) / **PARTIAL** (ops) | |
| Outbox dead-letter | **PARTIAL** | Worker DLQ + API/UI; calendar-sync e WhatsApp na outbox |
| Seed em produção | **NO-GO** | Seed é só desenvolvimento |

## Produto / compliance

| Item | Status | Notas |
|------|--------|-------|
| LGPD | **PARTIAL** | Políticas editáveis; DPO externo |
| Auditoria (`AuditEvent`) | **GO** em fluxos críticos | |
| Isolamento multi-tenant | **GO** | |
| Integrações externas | **GO (código)** / **PARTIAL (ops)** | Test-connection honesto; Google Calendar OAuth+sync (A38) requer env + consentimento |
| Comunicação (canais/envio) | **GO (código)** / **PARTIAL (ops)** | EMAIL=SMTP; WHATSAPP=Evolution se MOCK=false + credenciais; SMS stub |
| Certificado A1 | **PARTIAL** | Precisa PKCS#12 válido |
| Relatórios XLSX | **GO** (código) | |
| Recorrências financeiras | **GO** | |
| Convites SMTP | **GO** (código) / **NO-GO** ops sem SMTP | |
| Merge de pacientes | **GO** (código) / **PARTIAL** staging | Via Configurações + preview |
| Documentos | **GO** (código) | |
| Tarefas ricas | **GO** (código) | |
| Financeiro parcial/estorno | **GO** (código) | |
| Laboratório | **GO** (código) | |
| Profissional ↔ clínica/unidade | **GO** (código) | Escopo rígido com `clinicId` (Fatia 3) |
| Retornos `allowedHours` | **GO** (código worker) | |
| E2E Playwright | **GO** (suíte Fatia 4) / **PARTIAL** sem seed | `fatia4-e2e.spec.ts` + smokes 1–3 + remessa-final |

## Checklist pré-release operacional

1. Rotacionar secrets; validar `ENCRYPTION_MASTER_KEY` (64 hex).
2. `pnpm db:deploy`; smoke login admin.
3. MinIO/S3 + teste de upload.
4. Configurar SMTP; testar reset, convite e envio manual EMAIL.
5. Imagens no Swarm; `/health`.
6. Backup Postgres (restore dry-run).
7. Desabilitar `*_MOCK=true` só com credencial real.
8. Google: `GOOGLE_CALENDAR_MOCK=false` + client/secret/redirect + OAuth + smoke create appointment → evento.
9. Evolution: `EVOLUTION_MOCK=false` + baseUrl/apiKey/instance + smoke lembrete/manual.
10. (Opcional) ClamAV / OTEL.
11. Revisar dead-letters e `allowedHours`.

## Remessa / Fatias

| Área | Status |
|------|--------|
| Regras financeiras | **GO** (código) |
| Tratamentos / Documentos / Tarefas / Lab / Pesquisa | **GO** (código) |
| Google Calendar | **GO** (código) se OAuth; webhook push se `GOOGLE_CALENDAR_WEBHOOK_URL`; senão pull-sync / disabled honesto |
| WhatsApp Evolution | **GO** (código) se MOCK=false + creds; senão FAILED |

## Veredito

Piloto controlado: código de Calendar/WhatsApp está pronto e falha de forma honesta sem credenciais. **Ainda não é go-live pleno:** secrets/HTTPS/storage/SMTP/migrations/backups bloqueiam ops. Odontograma 3D e áudio/transcrição fora de contrato.
