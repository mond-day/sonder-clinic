# Status de implementação

Atualizado — versão **1.1.6**.

## Concluído nesta entrega (1.1.6)

Residuais que a 1.1.5 ainda deixava abertos no código:

- **Recorrências financeiras:** `GET/POST/PATCH /finance-recurrences` + `POST .../:id/generate`; worker materializa títulos devidos; UI Financeiro → Recorrências.
- **ClamAV operable:** `AV_DRIVER=clamav` + `CLAMAV_HOST`/`CLAMAV_PORT` usa protocolo INSTREAM TCP real; sem host/daemon → `PENDING` (nunca `CLEAN` falso); infectado rejeita upload.
- **OpenTelemetry real:** pacote `@sonder/observability`; `OTEL_ENABLED=true` inicia SDK (console ou OTLP); default desligado com status explícito em `/health`.

## Herdado (1.1.5 e anteriores)

- Unidades/cadeiras, comissões por competência, AutomationRule → ReturnAlert.
- Branding/storage sem falso sucesso; payables/cashflow na UI.
- PatientMedia, assinatura A1 real, password reset SMTP, users/roles, integrações gated.

## Fora do escopo de “código residual” (produto)

| Item | Estado honesto |
|------|----------------|
| Odontograma 3D | Conceito/protótipo — fora de contrato HTTP |
| Secrets / HTTPS / Postgres gerenciado / SMTP / MinIO | Infra operacional — ver `PRODUCTION_READINESS.md` |
| ClamAV daemon na stack | Adapter pronto; serviço externo opcional |
| Collector OTEL | SDK pronto; endpoint externo opcional |
| LGPD processos DPO | Textos no app; processo jurídico externo |
| E2E completo de todos os residuals | Happy path no CI; casos novos manuais/recomendados |

## Docs

Índice em `docs/README.md`. Specs gigantes só em `docs/archive/`.
