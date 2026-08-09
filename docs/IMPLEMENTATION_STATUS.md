# Status de implementação

Atualizado — versão **1.1.6** + **QA P0** + **Tratamentos** + **Documentos** + **backlog P1/P2** + **UX polish** + **Remessa final** + **Fatias UX 1–4** + **última milha**.

## Última milha

### DONE
- **Google Calendar webhook push:** `POST /integrations/:id/calendar/watch` registra `events/watch`; endpoint público `POST /integrations/google/calendar/webhook` verifica token do canal e dispara pull-sync; idempotência via `WebhookReceipt`. Env: `GOOGLE_CALENDAR_WEBHOOK_URL` (+ token opcional)
- **Editores dedicados:** Termo/consentimento e Encaminhamento (além do gerador genérico de modelo)
- **Tratamentos:** aba **Evoluções** separada; sessão/confirmações em drawer/overlay inline (menos modal empilhado)
- **Mini-odontograma do resumo:** 5 faces (V, L/P, M, D, O/I) alinhado ao board

### Residual honesto
| Item | Motivo |
|------|--------|
| Renovação automática do canal Google | Canais expiram ~7 dias; renovar com `POST .../calendar/watch` (sem cron nesta milha) |
| Webhook em localhost | Google exige HTTPS público — use túnel/prod URL |
| Lista de evoluções históricas no modal do plano | Composer + aba dedicada; timeline completa permanece na ficha |

## Fatia 4 (integrações + E2E)

### DONE
- **Google Calendar OAuth real:** `POST /integrations/:id/oauth/start` → `authorizeUrl`; callback público `GET /integrations/google/callback`; tokens AES-GCM na conexão; status honesto em `oauth-status` / test-connection
- **Sync bidirecional mínimo:** clinic→Google via outbox `appointment.calendar-sync.requested` (create/reschedule/cancel) no worker; Google→clinic via `POST /integrations/:id/calendar/pull-sync` (eventos com `externalCalendarEventId`)
- **WhatsApp Evolution:** envio real com `EVOLUTION_MOCK=false` + `EVOLUTION_BASE_URL`/`API_KEY`/`INSTANCE` (env, canal ou IntegrationConnection); worker com fallback env; sem credenciais → FAILED/DISABLED honesto
- **E2E:** `apps/web/e2e/fatia4-e2e.spec.ts` cobre §§24–30 do UX refinement + API de integrações; skips claros sem seed
- Migration `20260809180000_fatia4_google_calendar_sync` (`Appointment.externalCalendarEventId`)

### GO se configurado / PARTIAL sem ops
| Item | Status |
|------|--------|
| Google Calendar | **GO (código)** se MOCK=false + OAuth concluído; webhook push **GO** se `GOOGLE_CALENDAR_WEBHOOK_URL`; senão pull-sync |
| WhatsApp Evolution | **GO (código)** se MOCK=false + baseUrl/apiKey/instance; **PARTIAL/ops** no default MOCK |
| SMS outbound | **PARTIAL** stub honesto |
| Chatwoot live | **PARTIAL** (test-connection; sem sync profundo nesta fatia) |

## Fatia 3 (UX refinement) — preservada

### DONE
- Merge removido da listagem operacional de pacientes
- Configurações → **Pacientes duplicados**
- Evolução: modal de detalhe; editar/assinar DRAFT; hard delete
- Odontograma: 5ª face **L/P**, inspetor lateral
- Escopo profissional rígido com `clinicId`
- E2E: `fatia3-smoke.spec.ts`

## Remessa final pós-auditoria — preservada

### DONE
- Financeiro P0 líquido; Payable; Documentos preview; Tratamentos modal; Tarefas recorrência; LabCase; Profissionais scope; Pesquisa; E2E remessa-final

### PARTIAL (infra / fora de produto)
| Item | Motivo |
|------|--------|
| SMTP / MinIO / ClamAV / OTEL / backups / HTTPS | Infra externa |

### OUT OF SCOPE
- Odontograma 3D, IA clínica autônoma, app mobile, teleodontologia, estoque completo

## Docs

Índice em `docs/README.md`. Specs gigantes só em `docs/archive/`.
