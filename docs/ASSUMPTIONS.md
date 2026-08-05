# Sonder Clinic — Assumptions de implementação

Assumptions adotadas para concluir o MVP sem bloquear. Ver também `DUVIDAS_E_ASSUMPTIONS.md` e `DUVIDAS_PARA_RESPONDER.md`.

| ID | Decisão | Impacto se mudar |
|----|---------|------------------|
| A1 | Produto: Sonder Clinic | Branding |
| A2 | PostgreSQL dev: `sonder`/`senha123`/`sonder_clinic` | `.env` |
| A3 | `QUEUE_DRIVER=memory` em dev; Redis só em produção | Infra |
| A4 | Storage local em `.data/storage` em dev | Path de arquivos |
| A5 | Antivirus stub em dev (`AV_DRIVER=stub`) | Pipeline upload |
| A6 | Integrações com `*_MOCK=true` sem credenciais | Adapters |
| A7 | AbacatePay API v2 + HMAC webhook | Adapter pagamento |
| A8 | Nibo Empresas via header `ApiToken` | Adapter financeiro |
| A9 | Evolution API v2 (`apikey`, sendText, webhooks) | Messaging |
| A10 | Chatwoot via `api_access_token` | Atendimento |
| A11 | Tipografia Geist Sans/Mono; paleta verde clínico da spec | UI |
| A12 | UUID v7 via `uuid` package quando Prisma não nativo | IDs |
| A13 | Fuso America/Cuiaba na apresentação; UTC no banco | Datas |
| A14 | Seed fictício completo para demo | Dados iniciais |
| A15 | FullCalendar community (sem Scheduler premium) | Agenda UI |
| A16 | Assinatura A1 mockada em dev | Documentos |
| A17 | OpenAI mock estruturado em dev | Prescrições |
| A18 | Migração Codental: CLI/staging stub (Fase 11 parcial) | Import |
| A19 | Portas: web 3000, api 4000; worker embutido se `WORKER_EMBEDDED=true` | Scripts |
| A20 | OTEL opcional (`OTEL_ENABLED=false` em dev) | Observability |
| A21 | Estrutura de módulos NestJS pragmática (não DDD cerimonial) | Manutenção |
| A22 | Next.js 15 se 16 indisponível no registry; alvo 16.x | Frontend |

Última atualização: implementação inicial do MVP.
