# Dúvidas e Assumptions — Sonder Clinic ERP

Documento criado no início da implementação para não bloquear o desenvolvimento.
Decisões reversíveis registradas aqui e em `docs/adr/` quando estruturais.

## Decisões definitivas de produto e operação

- Domínio padrão: `app.sonder.clinic`, sempre substituível por env.
- Deploy inicial com uma clínica, preservando cadastro de novas clínicas.
- SMTP e remetente são configurados por env.
- Nibo usa escopo configurável, por clínica por padrão e opcionalmente por dentista.
- AbacatePay opera em produção; credenciais ficam em configuração segura por tenant.
- Evolution, Chatwoot, Google Calendar e IA são configuráveis na aba Integrações.
- IA usa OpenAI como provider inicial e modelo configurável, sem acoplamento do domínio.
- Redis existe somente em produção; desenvolvimento usa fila em memória.
- Produção reutiliza Redis e MinIO existentes nas networks externas `digital_network` e
  `traefik_public`; ClamAV permanece desativado até instalação.
- Backup usa o MinIO do mesmo host, com destino externo configurável posteriormente.
- Certificado A1 de produção será enviado por upload seguro ou secret/path, nunca pelo Git.
- Importação Codental está preparada e será ativada quando os arquivos forem fornecidos.
- Consentimento LGPD, Política de Uso e Política de Privacidade são documentos configuráveis.
- Branding é configurável (nome, logo, favicon e cores), com fallback por env.

## Assumptions adotadas (seguir sem bloquear)

| ID | Assumption | Motivo |
|----|------------|--------|
| A1 | Nome do produto: **Sonder Clinic**; monorepo na pasta `sonder-clinic`. | Workspace existente. |
| A2 | Dev: PostgreSQL local `sonder_clinic` / user `sonder` / senha `senha123`. Redis **não** sobe em dev. | Pedido explícito do usuário + Redis só em prod. |
| A3 | Em desenvolvimento, filas usam adapter **in-memory** (`QUEUE_DRIVER=memory`). Em produção, BullMQ+Redis. | Compatível com A2. |
| A4 | Storage em dev: diretório local `./.data/storage`; produção conecta ao MinIO existente por env. | Infra compartilhada confirmada. |
| A5 | Antivirus em dev: stub `SCAN_SKIPPED_DEV`; produção usa `AV_DRIVER=disabled` até ClamAV ser instalado. | ClamAV ainda indisponível. |
| A6 | Integrações externas: env é bootstrap/fallback; configuração criptografada por tenant tem precedência. | Decisão definitiva. |
| A7 | AbacatePay: API v2 (`https://api.abacatepay.com/v2`), Bearer token, transparent PIX/BOLETO, webhooks com HMAC `X-Webhook-Signature`, eventos `transparent.completed` etc. | Docs oficiais. |
| A8 | Nibo Empresas: header `ApiToken`, base `https://api.nibo.com.br/empresas/v1`, schedules de crédito/débito, customers. | Docs Nibo readme.io. |
| A9 | Evolution API v2: header `apikey`, `/instance/create`, `/message/sendText/{instance}`, webhooks `MESSAGES_UPSERT`. | Docs Evolution. |
| A10 | Chatwoot: header `api_access_token`, `/api/v1/accounts/{id}/contacts|conversations|webhooks`. | Docs Chatwoot. |
| A11 | Tipografia: **Geist Sans / Geist Mono** (não Inter). Paleta da spec (verde clínico `#176B5B`). | Spec + regra anti-AI-slop. |
| A12 | UUID: Prisma `@default(uuid(7))` quando suportado; fallback `uuidv7()` via lib. | Spec §6.2. |
| A13 | Fuso: persistir UTC; apresentar `America/Cuiaba`. | Spec. |
| A14 | Seed: 1 organização, 1 clínica, 1 unidade, 2 cadeiras, usuários por perfil, procedimentos TUSS fictícios, pacientes fictícios. | Spec §14 seeds. |
| A15 | FullCalendar Scheduler premium: usar **FullCalendar community** (timegrid/list) no MVP para evitar licença premium. | Spec pede validar licença. |
| A16 | Assinatura A1: mock em dev; produção recebe `.pfx/.p12` por secret/path ou upload criptografado, com senha separada. | Certificado real disponível fora do Git. |
| A17 | IA de prescrição: OpenAI default, provider/modelo configuráveis e mock estruturado em dev. | API key disponível fora do Git. |
| A18 | Migração Codental: fluxo de staging preparado e fallback sem importação até recebimento dos arquivos. | Arquivos serão enviados depois. |
| A19 | Portas dev: web `3000`, api `4000`, worker embutido opcional no mesmo processo API quando `WORKER_EMBEDDED=true`. | Simplicidade do script `dev.command`. |
| A20 | OpenTelemetry: SDK configurável; em dev exporta só console se `OTEL_ENABLED=true`. | Evitar dependência de collector local. |

## Impacto se assumptions mudarem

- A2/A3: trocar `QUEUE_DRIVER` — sem mudança de domínio.
- A6–A10: apenas env vars e conexões `IntegrationConnection`.
- A15: substituir componente de agenda sem alterar API.
- A16: ativar worker real de assinatura sem alterar fluxo clínico.
