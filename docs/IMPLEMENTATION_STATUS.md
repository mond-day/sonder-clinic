# Status de implementação

Atualizado em 05/08/2026 — versão **1.0.0**.

## Concluído

### Fundação e infraestrutura
- Monorepo pnpm/Turborepo (`web`, `api`, `worker`, `database`) na versão semver `1.0.0`.
- PostgreSQL 16 em dev; Redis **somente em produção**.
- Dockerfiles multi-stage para `api`, `web` e `worker`.
- Stack Swarm (`infra/swarm/stack.production.yml`) com networks externas `digital_network` e `traefik_public`, healthchecks, limites/reservas e secrets externos.
- CI (`.github/workflows/ci.yml`) e publicação GHCR (`.github/workflows/release-images.yml`).
- Decisões de produto e segredos em `docs/DUVIDAS_E_ASSUMPTIONS.md` + ADR `0002`.

### Auth e RBAC
- Argon2id + JWT + refresh rotativo.
- `PermissionsGuard` + `@RequirePermissions` nos endpoints sensíveis.

### Domínio implementado (API)
- Pacientes e agenda com conflitos.
- Prontuário, evolução assinável, correções por adendo, notas privadas.
- Anamnese (templates + respostas + assinatura + alertas).
- Odontograma (FDI, condições seed).
- Procedimentos, planos de tratamento, aprovação parcial, sessões.
- Documentos (templates, geração, assinatura, validação pública).
- Financeiro (recebíveis, pagamentos idempotentes, estornos, outbox).
- Comissões (regras).
- Comunicação (listagem de deliveries) e relatórios resumidos.
- Prescrição assistida (OpenAI default, mock, revisão obrigatória).
- Integrações com credenciais criptografadas (AES-256-GCM), mascaradas na leitura, auditoria.
- Settings: branding e documentos legais (Privacidade, Uso, Consentimento LGPD).
- **Workspace:** return-alerts, tasks, lab-cases e notifications (CRUD mínimo + summary + marcar leitura), com escopo por `organizationId` e RBAC.

### Web
- Login real com cookies HttpOnly, renovação automática do JWT, logout e redirecionamento de sessão expirada.
- **Workspace clínico (05/08/2026):** shell com sidebar verde-petróleo agrupada (Operação/Clínica/Administração), **sidebar recolhível** (preferência em `localStorage` + a11y), tokens do protótipo, pesquisa global ⌘K via `GET /patients?search=`, **painel de notificações** clicável (drawer com Esc/clique fora).
- Visão diária operacional com agenda do dia, métricas e atalho para prontuário.
- Pacientes: pesquisa enriquecida (última consulta, tratamento, próxima ação, status) + **prontuário dedicado** em `/pacientes/[patientId]` com abas Resumo, Anamnese, Odontograma, Tratamentos, Evolução, Financeiro e Documentos; **Modo atendimento** (apresentação) oculta `.sensitive`.
- Agenda com modos dia/semana/cadeiras, filtros e board semanal fiel ao protótipo.
- Central de retornos, Tarefas (kanban) e Laboratório & casos consumindo endpoints reais do módulo `workspace`.
- Configurações com seções (unidades/equipe, procedimentos, retornos, financeiro, comunicação, integrações, branding, legal); alias `/integracoes` redireciona a mesma view.
- Financeiro com subnavegação (visão geral, a receber, a pagar, comissões, recorrências, fluxo); a receber/comissões usam API real; demais abas documentadas como pendentes.
- Seed rico idempotente (`seed-rich-data.ts`) popula pacientes, agenda, retornos, tarefas, lab, notificações e financeiro.
- Auditoria e decisões em `docs/frontend-audit.md`, `docs/frontend-decisions.md`, `docs/api/pending-workspace-contracts.md`.
- App shell e dashboard consumindo dados reais da API, com usuário autenticado e contexto de clínica/unidade.
- Consultas reais com estados de carregamento, vazio, erro e nova tentativa para pacientes, agenda, tratamentos, prontuário, odontogramas, documentos, financeiro, comissões, comunicação, integrações/settings e relatórios.
- Seletor de clínica no header persistido em `localStorage`, propagado para agenda, pacientes, tratamentos, documentos, financeiro, settings, dashboard e relatórios.
- Seletor de paciente persistido em prontuário, odontograma e documentos.
- Pacientes: criação e edição com Zod no client e servidor.
- Agenda: criação, remarcação e cancelamento; conflitos de profissional/cadeira permanecem validados no servidor.
- Prontuário: criação de evoluções; odontograma versionado com atualização incremental de dentes/condições.
- Financeiro: criação de títulos e recebimentos idempotentes.
- Settings: branding, documentos legais e credenciais de integrações; segredos são enviados em campos de senha, criptografados e retornam somente mascarados.
- **UX por modais (05/08/2026):** componente compartilhado acessível (trap de foco, Esc, backdrop seguro, ARIA e retorno de foco); detalhes/edição de tarefas, agenda e laboratório; criação contextual de tarefa, agendamento e solicitação laboratorial.
- Agenda com categoria clínica separada de origem, etiquetas configuráveis e lembrete WhatsApp persistido. Sem Evolution ativo, o estado fica desativado e nenhum envio é simulado.
- Prontuário com modais reais para anamnese, evolução, geração de documentos e receitas em rascunho.
- Contas a receber abrem detalhe com tratamento/orçamento vinculado; filtros recolhíveis preservam preferência local.
- Integrações (incluindo Nibo), branding e etiquetas são configuradas em modais. A1 exibe status seguro sem upload fictício.
- Páginas legais `/legal/{privacidade|uso|consentimento}`.
- Branding via env (`BRAND_*`) com fallback.

## Auditoria UI ↔ API (05/08/2026)
- **Operacional para consulta:** dashboard, pacientes, agenda (dia/semana/cadeiras), planos, prontuário, odontogramas, modelos/documentos gerados, recebíveis, regras de comissão, deliveries, integrações, branding, legal, relatórios, **retornos, tarefas, lab-cases e notificações**.
- **Operacional em autenticação:** login, refresh rotativo, cookies HttpOnly, logout, tratamento de 401 e RBAC aplicado na API.
- **Operacional em mutações principais:** pacientes (criar/editar), agenda (criar/remarcar/cancelar), evolução clínica, odontograma, títulos/recebimentos, settings/integrations, **retorno (contato/status), tarefa (mover coluna), lab (avançar status), notificação (marcar lida)**.
- **Operacional em seletores:** clínica persistida e paciente explícito nos módulos clínicos/documentais.
- **Residual não bloqueante:** aprovação/execução de planos, assinatura/correção de evoluções, geração/assinatura de documentos, estornos, comissões e automações ainda usam endpoints sem fluxo visual completo.
- **Residual — relatórios:** resumo real disponível; exportação CSV e filtros de período/clínica ainda não foram implementados.
- **Residual — equipe/permissões e financeiro ampliado:** sem endpoints `/users`, `/roles`, `/payables`, `/cashflow`; documentado em `docs/api/pending-workspace-contracts.md`.

### Revisão estrutural/UX (05/08/2026)
- Camada central pt-BR ampliada para enums clínicos, financeiros, operacionais e de integrações.
- Combobox pesquisável acessível e disclosures reutilizáveis aplicados aos principais formulários.
- Tarefas usam os vínculos reais já existentes (`patientId` e `category`); evolução agora envia o `treatmentId` opcional já modelado em `ClinicalEntry`.
- Laboratório recebe prazo somente como data na UI e persiste valor normalizado.
- Integrações exibem campos específicos por provedor e mantêm segredos mascarados/criptografados.
- Upload A1 multipart operacional com parse PKCS#12, storage privado local, senha AES-256-GCM, RBAC, isolamento por organização/clínica e auditoria.
- Relatórios agregados aceitam período e retornam agenda, pacientes, financeiro, tratamentos, comissões e comunicação com dados Prisma reais.

## Parcial / próximo
- Adapter MinIO/S3 para certificado A1 em produção, ClamAV e validação de cadeia/revogação ICP-Brasil.
- Google Calendar OAuth completo, automações Evolution/Chatwoot em fila Redis.
- Fechamento de comissões + reconciliação financeira completa.
- Importação Codental (fluxo preparado; arquivos virão depois).
- Recuperação de senha e tela de sessões.

## Qualidade
```bash
pnpm typecheck && pnpm test && env -u NODE_ENV pnpm build
pnpm db:deploy && pnpm db:seed
```
Validado em 05/08/2026 com typecheck, 6 testes, build (sem `NODE_ENV=development` herdado do `.env`), `db:deploy`, seed idempotente e smoke autenticado da API cobrindo tarefas, laboratório, agenda/etiquetas/lembrete e recebíveis. Rotas agenda, tarefas, laboratório, financeiro e configurações responderam 200. Seed gera ~16 pacientes, 41 agendamentos, 23 retornos, 17 tarefas, 13 casos lab, 12 notificações, etiquetas, lembretes, vínculos financeiros e receitas fictícias.

Imagens: ver `docs/RELEASE.md`.
