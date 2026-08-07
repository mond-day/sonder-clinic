# Status de implementação

Atualizado em 06/08/2026 — versão **1.1.5**.

## Concluído nesta entrega (1.1.5)

### Residuais 1.1.4
- **Unidades/cadeiras:** CRUD em `GET/POST/PATCH /settings/units` e `POST /settings/units/:id/chairs` + `PATCH /settings/chairs/:id`; UI em Configurações → Unidades.
- **Comissões por competência:** geração de `CommissionEvent` (+ espelho `CommissionEntry`) no pagamento; `GET /commission-events`, `GET/POST /commission-periods`, close/reopen; UI Financeiro → Comissões.
- **AutomationRule:** `GET/POST/PATCH /automation-rules`; worker processa `appointment.completed` e cria `ReturnAlert`; UI em Configurações → Retornos automáticos.
- **Branding/storage:** path explícito local (dev) / MinIO|S3 (prod); upload falha com erro claro se storage desabilitado (sem falso sucesso).
- Payables e cashflow consumidos na UI (API já existia).

### Docs / limpeza
- Checklist de produção em `docs/PRODUCTION_READINESS.md`.
- Guia para agentes em `docs/AGENTS.md`.
- HTMLs soltos na raiz removidos; referências em `HTML_REFERENCIAS/` (+ README).
- Specs longas movidas para `docs/archive/`.

## Herdado de 1.1.4 / 1.1.3

- Upload `PatientMedia`, assinatura A1 real, password reset via SMTP (erro sem SMTP).
- Users/roles HTTP + UI.
- Integrações desabilitadas sem credencial / `*_MOCK=true` (sem falso sucesso).
- UX agenda, pacientes, prontuário, financeiro.

## Residual conhecido (não bloqueia “complete enough” 1.1.5)
- Odontograma 3D continua conceito/protótipo.
- Recorrências financeiras (`FinanceRecurrence`) sem API/UI.
- ClamAV gated; sem socket → arquivo não marcado como limpo.
- Assinatura A1 e recuperação de senha dependem de certificado PKCS#12 e SMTP em produção.
- E2E cobre happy path; não cobre todos os residuals novos.
