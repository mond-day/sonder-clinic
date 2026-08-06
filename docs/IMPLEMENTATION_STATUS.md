# Status de implementação

Atualizado em 05/08/2026 — versão **1.1.0**.

## Concluído nesta entrega (1.1.0)

### Referências HTML
- Pacote V2 Anamnese/Evolução em `HTML_REFERENCIAS/02_ANAMNESE_EVOLUCAO_V2/`.
- Pacote completo de protótipos aprovados em `HTML_REFERENCIAS/01_WORKSPACE_APROVADO/` (agenda, pacientes, odontograma, plano, documentos, tarefas, labs, financeiro, relatórios, usuários, configurações).
- Precedência: V2 sobrescreve anamnese/evolução do pacote 01.

### Schema / migrações aditivas
- `20260806010000_integral_v11`: anamnese V2 (status, assinaturas, link remoto), evolução (anexos/vínculos), agenda status events, tarefas (checklist/recorrência), laboratórios, payables/cashflow/comissões, convites de usuário.

### Anamnese V2
- Catálogos seed: Adulto 42, Infantil 48, Idoso 45, Gestante 38.
- Editor/API completa (draft, publish, version, sign, remote link).
- UI workspace no prontuário + página pública `/assinar/anamnese/[token]`.

### Evolução V2 (API)
- Listagem filtrada, draft patch, anexos, adendo com kind, campos tooth/region/treatmentItem.

### Demais módulos
- Usuários/roles/permissions API + UI `/usuarios`.
- 15 relatórios (`/reports/catalog` + `/reports/by/:id`) com export CSV/XLSX/PDF-texto.
- Payables + cashflow API.
- Storage package (`local` / MinIO gated) + ClamAV gated sem falso sucesso.
- Adapters reais Evolution/Nibo/Google/Chatwoot — mock/disabled **não** simula sucesso.
- Tipografia Manrope + Source Serif 4.

### Qualidade
- Playwright E2E dos 12 fluxos (§37) no CI.
- `pnpm typecheck`, `pnpm test`, `env -u NODE_ENV pnpm build`, `db:deploy`, `db:seed` validados localmente.

## Integrações desabilitadas sem credencial
- Evolution, Nibo, Google Calendar, Chatwoot, AbacatePay, OpenAI: estado desativado quando `*_MOCK=true` ou env ausente.
- MinIO: requer `STORAGE_DRIVER=minio|s3` + endpoint/keys; sem SDK S3 no runtime ainda falha de forma explícita.
- ClamAV: `AV_DRIVER=clamav` + `CLAMAV_HOST`; sem socket → não marca arquivo como limpo.

## Residual conhecido
- Editor visual drag-and-drop completo de anamnese em Configurações (API pronta; UI principal no prontuário).
- Odontograma faces 100% interativo e documentos paper preview ainda evoluem sobre a base 1.0.
- PDF gráfico (export atual é texto/CSV compatível XLSX).
