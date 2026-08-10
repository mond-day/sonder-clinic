# Sonder Clinic — Assumptions de implementação

Assumptions adotadas para não bloquear o desenvolvimento. Histórico detalhado em `archive/DUVIDAS_E_ASSUMPTIONS.md`.

| ID | Decisão | Notas atuais |
|----|---------|--------------|
| A1 | Produto: Sonder Clinic | Branding |
| A2 | PostgreSQL dev: `sonder`/`senha123`/`sonder_clinic` | `.env` |
| A3 | `QUEUE_DRIVER=memory` em dev; Redis só em produção | Infra |
| A4 | Storage local em `.data/storage` em dev | Path de arquivos |
| A5 | Antivirus: `AV_DRIVER=stub` em dev; `clamav` + host em prod opcional | Sem daemon → PENDING |
| A6 | Integrações com `*_MOCK=true` sem credenciais | Adapters |
| A7–A10 | AbacatePay / Nibo / Evolution / Chatwoot conforme docs oficiais | Adapters |
| A11 | Tipografia Geist; paleta verde clínico | UI |
| A13 | Fuso America/Cuiaba na apresentação; UTC no banco | Datas |
| A14 | Seed fictício completo para demo | Dados iniciais |
| A16 | Assinatura A1: PKCS#12 real via upload/storage | Ver `certificado-a1.md` |
| A17 | OpenAI mock estruturado em dev | Prescrições |
| A18 | Migração Codental: desabilitada até arquivos | Import |
| A19 | Portas: web 3000, api 4000 | Scripts |
| A20 | OTEL opcional via `@sonder/observability` | `OTEL_ENABLED=false` default |
| A21 | Módulos NestJS pragmáticos | Manutenção |
| A22 | Comissões: `CommissionEvent` é fonte de verdade | `CommissionEntry` legado só histórico/seed; sem novas gravações |
| A23 | Overpayment bloqueado | Sem crédito de paciente implícito; estorno parcial → `PARTIALLY_REFUNDED` |
| A24 | Outbox multi-réplica | Claim com `SKIP LOCKED` + lease 60s; dead-letter após 5 tentativas |
| A25 | Tratamentos: enum QA + archive via `archivedAt` | `PARTIALLY_APPROVED` mantido; exclusão física só DRAFT sem vínculo |
| A26 | Sessões multi-etapa | Item só `COMPLETED` ao atingir `plannedSessions` ou `POST .../complete` |
| A27 | Estorno comissão idempotente | `PAYMENT_REFUND.sourceId` = `refundId` (não `paymentId`) |
| A28 | Pastas de documentos | `PatientDocumentFolder` + `folderId` tipado em `GeneratedDocument`/`Prescription`/`PatientMedia` (agrupamento lógico; sem mover storage) |
| A29 | Identidade em documentos | Montada no servidor em `frozenContent.identity`; client envia só `clinicalContent` |
| A30 | Assinatura remota de documentos | Token hash + expiração + uso único + revogação (`DocumentSignatureRequest` + rotas públicas) |
| A31 | UI Documentos unificada | Feature `features/documents` reutilizada na ficha e em `documents-view`; identidade só via `clinicalContent` |
| A32 | Expense vs Payable | **Payable** é o lançamento operacional (API/UI/worker). `Expense` permanece legado para seed e relatório `expenses` (união Expense+Payable). Novas despesas → Payable + categoria/centro de custo |
| A33 | Convites de usuário | Exigem SMTP real (`SMTP_HOST`); token só no e-mail; aceite público em `/auth/accept-invitation` |
| A34 | Integrações sem credencial | Superfície de API existe; `POST /integrations/:id/test-connection` carrega credenciais salvas e falha explicitamente em MOCK/sem config — não declarar GO sem credenciais |
| A35 | Comunicação (templates/canais) | Templates + opt-in + CRUD MessagingChannel + envio manual. EMAIL=SMTP; WHATSAPP=Evolution real se `EVOLUTION_MOCK=false` + baseUrl/apiKey/instance (env, canal ou IntegrationConnection); senão FAILED (nunca SENT falso). SMS ainda stub |
| A36 | Áudio/transcrição | Explicitamente fora de escopo do backlog QA |
| A37 | Merge de pacientes | Origem → destino; move vínculos clínicos/financeiros; origem vira ARCHIVED; ClinicalRecord por clínica é consolidado; pastas com mesmo nome são unificadas |
| A38 | Google Calendar OAuth | **Fatia 4 + remessa P2:** OAuth real; sync clinic→Google (outbox); Google→clinic via pull-sync **e** webhook se `GOOGLE_CALENDAR_WEBHOOK_URL`. Auto-renew no worker se `GOOGLE_CALENDAR_WATCH_AUTO_RENEW=true` (lead/interval configuráveis). Sem webhook URL → pull-sync só. Exige `GOOGLE_CALENDAR_MOCK=false` + OAuth — **GO só com OAuth concluído** |
| A39 | Retornos `allowedHours` | Formato `{ start, end, weekdays, timezone? }` (default TZ `America/Cuiaba`). `{}` = 24/7. Se **todas** as regras matching estão fora da janela, o outbox adia com `leaseUntil` sem consumir attempts. Se há regras dueNow + deferred, só dueNow rodam e o evento é marcado processado (deferred daquele evento não reexecutam) |
| A40 | Financeiro líquido | `paidAmount`/`outstandingAmount` vêm da API (`buildReceivableFinanceView`); front não recalcula regra. OVERDUE é efetivo se saldo > 0 e `dueDate < hoje` |
| A41 | Tarefas recorrentes | Idempotência via `Task.occurrenceKey`; worker + `POST /tasks/:id/recurrence/generate` |
| A42 | Escopo profissional | Tabelas `ProfessionalClinic`/`Unit`/`Specialty`. Com `clinicId`, listagens/filtros **exigem** vínculo ativo (sem fallback “sem links”). Migration Fatia 3 backfill + seed criam vínculos |
| A43 | Duplicados de paciente | `PatientDuplicateDismissal` persiste “não são duplicados”; merge só via Configurações com preview de conflitos |
| A44 | Evolução DRAFT | Exclusão é **hard delete** (`DELETE /clinical-entries/:id`) com auditoria `clinical.draft_deleted` |
| A45 | Calendar event mapping | `Appointment.externalCalendarEventId` guarda o id do evento Google; cancelamento remove o evento quando OAuth ativo |
| A46 | Anamnese multi-tenant | Escopo **global na organização**: `clinicId` deve ∈ org; não exige `PatientClinic`. Hash canônico inclui `clinicId`/`patientId`/`templateId`/`templateVersion`/answers (breaking, só dev) |
| A47 | Anamnese lifecycle | `AWAITING_SIGNATURE` é imutável (409). Reopen só sem assinaturas. Assinada não reabre: cancelar (`CANCELLED`, preserva signatures) ou criar atualização (cancela vigente + novo DRAFT). `SUPERSEDED` legado; fluxo novo preferencialmente `CANCELLED`. `EXPIRED` materializado no worker + `effectiveStatus` na API |
| A48 | Produção por procedimento | Valor = **recebimentos** (pagamentos líquidos no período) do plano; elegibilidade = `TreatmentSession.completedAt` no período e `correctionOfId IS NULL`. Item APPROVED sem sessão → 0 |

Última atualização: **Remessa P0/P1/P2 pós-auditoria — anamnese, produção financeira, Google watch auto-renew**.
