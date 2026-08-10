# Status de implementação

Atualizado — versão **1.1.6** + remessa **P0/P1/P2 pós-auditoria anamnese/produção/Google watch**.

## Remessa P0/P1/P2 pós-auditoria (anamnese + produção + watch)

### DONE (código)
- **Anamnese P0:** lock `409` em `AWAITING_SIGNATURE`; `POST .../reopen-draft` (sem assinaturas); hash canônico breaking; finalize só com assinaturas do mesmo hash; revoke request; `clinicId ∈ org` (prontuário global na org); FKs Clinic/Patient; `effectiveStatus`; job worker materializa `EXPIRED`; auditoria crítica; delete draft; atualização cancela vigente assinada (`CANCELLED`, signatures preservadas)
- **Anamnese P1:** summary-strip, histórico operacional, detail modal, continuar/excluir draft, requests/revoke UI, link público melhorado, bootstrap modelos só no create-org (seed `installDefaultAnamnesisTemplates`), editor modelos com filtros/preview/validate, E2E `anamnesis-e2e.spec.ts` (**GO** — run local A–F + documentos admin)
- **Documentos admin P1:** PATCH + editor estruturado mínimo + preview fictício + validate antes de publish (workspace do paciente **não** reconstruído)
- **Produção por procedimento:** elegibilidade `TreatmentSession.completedAt` (sem correções); valor = recebimentos líquidos do plano alocados às sessões; exports usam a mesma query
- **Google watch P2:** auto-renew configurável (`GOOGLE_CALENDAR_WATCH_AUTO_RENEW` + lead/interval); lease de idempotência; UI de expiração/status

### PARTIAL
| Item | Motivo |
|------|--------|
| Google watch renew em prod | Exige `GOOGLE_CALENDAR_WEBHOOK_URL` HTTPS + OAuth; sem URL permanece pull-sync |
| Bootstrap modelos em runtime | Só no seed/create-org (opção A); não há endpoint `install-defaults` |

### Migration
- `20260810010000_anamnesis_p0_fks_cancelled` — enum `CANCELLED` + FKs `AnamnesisResponse`→Clinic/Patient

## Última milha (preservada)

### DONE
- **Google Calendar webhook push:** `POST /integrations/:id/calendar/watch` + webhook público + `WebhookReceipt`
- **Editores dedicados:** Termo/consentimento e Encaminhamento
- **Tratamentos / mini-odontograma:** evoluções separadas; 5 faces

### Residual honesto
| Item | Motivo |
|------|--------|
| Webhook em localhost | Google exige HTTPS público — use túnel/prod URL |
| Lista de evoluções históricas no modal do plano | Composer + aba dedicada; timeline completa permanece na ficha |

## Fatia 4 (integrações + E2E)

### DONE
- **Google Calendar OAuth real:** `POST /integrations/:id/oauth/start` → `authorizeUrl`; callback público `GET /integrations/google/callback`; tokens AES-GCM na conexão; status honesto em `oauth-status` / test-connection
- **Sync bidirecional mínimo:** clinic→Google via outbox; Google→clinic via pull-sync + webhook
- **WhatsApp Evolution:** envio real com `EVOLUTION_MOCK=false`
- **E2E:** `apps/web/e2e/fatia4-e2e.spec.ts`
- Migration `20260809180000_fatia4_google_calendar_sync`

### GO se configurado / PARTIAL sem ops
| Item | Status |
|------|--------|
| Google Calendar | **GO (código)** se MOCK=false + OAuth; webhook + auto-renew **GO (código)** se URL HTTPS + `GOOGLE_CALENDAR_WATCH_AUTO_RENEW`; senão pull-sync |
| WhatsApp Evolution | **GO (código)** se MOCK=false + creds; **PARTIAL/ops** no default MOCK |
| SMS outbound | **PARTIAL** stub honesto |
| Chatwoot live | **PARTIAL** |

## Fatia 3 / Remessa final — preservadas

Merge em Configurações; Evolução modal; Odontograma 5 faces; Financeiro P0; Documentos paciente; Tratamentos workspace — **não reconstruídos** nesta remessa.

## Docs

Índice em `docs/README.md`. Specs gigantes só em `docs/archive/`.
