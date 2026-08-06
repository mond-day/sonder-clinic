# Status de implementação

Atualizado em 06/08/2026 — versão **1.1.2**.

## Concluído nesta entrega (1.1.2)

### Residuais 1.1.1 fechados
- Editor de anamnese: UI dedicada por regra para `visibleWhen` (seção/pergunta), `alertRules` e `riskRules` tipados no schema; workspace clínico filtra perguntas/seções condicionais.
- Odontograma: dentição permanente / decídua / mista, seleção multi-dente, chips de condição e pintura em lote (API já versionava por tipo).
- Certificado A1: upload/remoção via adapter unificado `@sonder/storage` (disco local em `STORAGE_DRIVER=local`, MinIO/S3 em prod). Sem credenciais → erro explícito, sem falso sucesso. Legado `.data/certificates` ainda legível na remoção.

### Qualidade
- Gates: `pnpm typecheck`, `pnpm test`, `env -u NODE_ENV pnpm build`, `db:deploy`, `db:seed`, `pnpm test:e2e`.

## Herdado de 1.1.1 / 1.1.0

### Referências HTML
- Pacote V2 Anamnese/Evolução em `HTML_REFERENCIAS/02_ANAMNESE_EVOLUCAO_V2/`.
- Pacote completo de protótipos aprovados em `HTML_REFERENCIAS/01_WORKSPACE_APROVADO/`.
- Precedência: V2 sobrescreve anamnese/evolução do pacote 01.

### Schema / migrações aditivas
- `20260806010000_integral_v11`: anamnese V2, evolução, agenda status events, tarefas, laboratórios, payables/cashflow/comissões, convites.

### Anamnese V2
- Catálogos seed Adulto/Infantil/Idoso/Gestante.
- API draft/publish/version/sign/remote link + UI no prontuário e `/assinar/anamnese/[token]`.

## Integrações desabilitadas sem credencial
- Evolution, Nibo, Google Calendar, Chatwoot, AbacatePay, OpenAI: desativado quando `*_MOCK=true` ou env ausente (sem simular sucesso).
- MinIO: `STORAGE_DRIVER=minio|s3` + `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`; sem credenciais o adapter fica `enabled=false` e upload A1 rejeita.
- ClamAV: `AV_DRIVER=clamav` + `CLAMAV_HOST`; sem socket → não marca arquivo como limpo.

## Residual conhecido (fora desta linha / depende de secret)
- Upload multipart genérico `PatientMedia` (rota HTTP) — modelo existe; transporte ainda não.
- Assinatura A1 de documentos ainda não consome o PKCS#12 armazenado (método A1 aceito na API sem cadeia ICP).
- ClamAV continua gated sem falso positivo.
- Odontograma 3D permanece conceito (protótipo).
