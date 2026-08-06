# Status de implementação

Atualizado em 06/08/2026 — versão **1.1.3**.

## Concluído nesta entrega (1.1.3)

### Residuais técnicos 1.1.2
- Upload multipart `PatientMedia` (`POST /patients/:id/media`) com storage + ClamAV gated (sem marcar limpo sem varredura).
- Assinatura A1 de documentos consome PKCS#12 armazenado (`method: A1`); `MOCK_A1` rejeitado; sem certificado válido → erro explícito.
- ClamAV permanece gated sem falso sucesso.

### UX
- Login: revelar senha + “Esqueci minha senha” via SMTP (erro claro sem SMTP).
- Agenda: modal em visualização, editar sob demanda, status editável, unidade/cadeira ocultos se únicos, etiquetas/antecedência em multiselect, observações únicas.
- Pacientes: ícones editar/visualizar/reticências; célula só com nome + última consulta (bug `[object Object]` corrigido).
- Prontuário: WhatsApp/editar em ícones; privacy-banner removido; alertas sutis; timeline alinhada; tratamentos/financeiro/documentos inline; anamnese e odontograma com botão Adicionar.

### Qualidade
- Gates: `pnpm typecheck`, `pnpm test`, `env -u NODE_ENV pnpm build`, `db:deploy`, `db:seed`, `pnpm test:e2e` (11/11).

## Herdado de 1.1.2 / 1.1.1

### Referências HTML
- Pacote V2 Anamnese/Evolução em `HTML_REFERENCIAS/02_ANAMNESE_EVOLUCAO_V2/`.
- Pacote completo de protótipos aprovados em `HTML_REFERENCIAS/01_WORKSPACE_APROVADO/`.

### Integrações desabilitadas sem credencial
- Evolution, Nibo, Google Calendar, Chatwoot, AbacatePay, OpenAI: desativado quando `*_MOCK=true` ou env ausente.
- MinIO/local storage via `@sonder/storage`.
- ClamAV: `AV_DRIVER=clamav` + `CLAMAV_HOST`; sem socket → não marca arquivo como limpo.
- SMTP: necessário para recuperação de senha (`SMTP_HOST`).

## Residual conhecido
- Odontograma 3D permanece conceito (protótipo).
- Assinatura A1 depende de certificado PKCS#12 válido configurado na clínica.
- Recuperação de senha depende de SMTP configurado.
