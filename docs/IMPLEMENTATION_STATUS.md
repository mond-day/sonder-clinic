# Status de implementação

Atualizado em 06/08/2026 — versão **1.1.1**.

## Concluído nesta entrega (1.1.1)

### Gaps fechados sobre 1.1.0
- Editor visual drag-and-drop de anamnese em Configurações (`Anamnese (modelos)`): listar/criar/editar rascunhos, reordenar seções/perguntas, publicar, nova versão, duplicar e arquivar via API existente.
- Odontograma 2D por faces (V/O/M/D) no prontuário, com seleção múltipla, painel do dente e gravação de nova versão.
- Documentos “paper”: biblioteca + prévia + gerar/assinar/PDF em `/documentos` e prévia no prontuário.
- Export PDF gráfico (pdfkit) para relatórios (`/reports/by/:id?format=pdf`) e documentos (`/documents/:id/pdf`).
- Storage MinIO/S3 com `@aws-sdk/client-s3` quando `STORAGE_DRIVER=minio|s3` + credenciais; disco local permanece o padrão de desenvolvimento. Status exposto em `GET /integrations`.

## Herdado de 1.1.0

### Referências HTML
- Pacote V2 Anamnese/Evolução em `HTML_REFERENCIAS/02_ANAMNESE_EVOLUCAO_V2/`.
- Pacote completo de protótipos aprovados em `HTML_REFERENCIAS/01_WORKSPACE_APROVADO/`.
- Precedência: V2 sobrescreve anamnese/evolução do pacote 01.

### Schema / migrações aditivas
- `20260806010000_integral_v11`: anamnese V2, evolução, agenda status events, tarefas, laboratórios, payables/cashflow/comissões, convites.

### Anamnese V2
- Catálogos seed Adulto/Infantil/Idoso/Gestante.
- API draft/publish/version/sign/remote link + UI no prontuário e `/assinar/anamnese/[token]`.

### Qualidade
- Playwright E2E dos fluxos principais no CI.
- Gates: `pnpm typecheck`, `pnpm test`, `env -u NODE_ENV pnpm build`, `db:deploy`, `db:seed`, `pnpm test:e2e`.

## Integrações desabilitadas sem credencial
- Evolution, Nibo, Google Calendar, Chatwoot, AbacatePay, OpenAI: desativado quando `*_MOCK=true` ou env ausente (sem simular sucesso).
- MinIO: `STORAGE_DRIVER=minio|s3` + `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`; sem credenciais o adapter fica `enabled=false`.
- ClamAV: `AV_DRIVER=clamav` + `CLAMAV_HOST`; sem socket → não marca arquivo como limpo.

## Residual conhecido
- Editor de anamnese cobre o fluxo principal (CRUD visual + DnD + publicação); regras avançadas de risco/condição ainda são editáveis via schema persistido, sem UI dedicada por regra.
- Odontograma foca dentição permanente; decídua/mista e ferramentas de pintura em lote seguem o protótipo como evolução.
- Upload clínico genérico (PatientMedia) ainda não troca o certificado A1 para o adapter MinIO — certificado permanece em path dedicado.
- ClamAV continua gated sem falso positivo.
