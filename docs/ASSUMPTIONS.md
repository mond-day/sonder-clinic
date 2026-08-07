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

Última atualização: **1.1.6**.
