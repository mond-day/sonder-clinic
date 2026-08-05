# Decisões de front-end — Workspace Clínico

**Data:** 5 de agosto de 2026 (atualizado)  
**Referências:** `PLANO_TECNICO_FRONTEND_SONDER_CLINIC.md`, `sonder-clinic-workspace-v3.html`

## Princípio

Presentation-first: o HTML é inspiração visual/funcional; o Markdown define a ordem e os critérios. Contratos reais da API NestJS têm prioridade sobre modelos sugeridos no plano. **Sem mocks de produção** — telas populadas via seed do banco.

## Decisões

### D1 — Tokens visuais do Workspace

Adotar a paleta do protótipo (`--nav`, `--accent`, `--canvas`, etc.) em `globals.css`, preservando classes existentes (`.button`, `.panel`, `.badge`) para não quebrar módulos legados de uma vez. Classes novas (`.week-board`, `.task-board`, `.return-layout`, `.alerts-drawer`, `.settings-layout`, `.segmented`) espelham a estrutura visual do HTML sem copiar o markup literal.

### D2 — Navegação agrupada + sidebar recolhível

Sidebar espelha Operação / Clínica / Administração. Preferência de recolhimento persistida em `localStorage` (`sonder.sidebar.collapsed`), com `aria-expanded` e atalho de teclado no botão. Em mobile a sidebar volta a ser gaveta (modo recolhido é só desktop). Rotas legadas (`/tratamentos`, `/documentos`, `/comissoes`, `/comunicacao`) permanecem acessíveis.

### D3 — Prontuário em rota dedicada

`/pacientes/[patientId]` abre ficha isolada (sem lista lateral). Aba ativa via query `?tab=` para recarregar e manter contexto. `/pacientes` continua como pesquisa enriquecida (última consulta, tratamento, próxima ação, status, pendência financeira) consumindo endpoints reais.

### D4 — Modo atendimento

Estado apenas de apresentação (`sessionStorage` / React state). Oculta classes `.sensitive` (financeiro, contatos não essenciais). Não altera permissões nem payloads da API.

### D5 — Módulos de workspace agora com backend real

Retornos, tarefas, laboratório e notificações passaram a ter modelos Prisma + endpoints NestJS reais (`apps/api/src/modules/workspace`). O front consome esses contratos; `UnavailableFeature` permanece apenas para áreas financeiras ainda sem API (payables, recorrências, fluxo de caixa).

### D6 — Financeiro unificado

`/financeiro` ganha subnavegação (visão geral, a receber, a pagar, comissões, recorrências, fluxo). Contas a receber e visão geral usam `/receivables` e `/reports/summary`. Comissões reutilizam `/commission-rules`. Demais abas ficam bloqueadas até API.

### D7 — Pesquisa global

Atalho ⌘/Ctrl+K foca o campo; busca usa `GET /patients?search=&clinicId=` (já suportado). Sem endpoint genérico de “tudo”.

### D8 — Badges e painel de notificações

Badges da sidebar (retornos, tarefas, lab) e o contador do topbar vêm de `WorkspaceProvider`, que agrega `GET /return-alerts/summary`, `GET /tasks`, `GET /lab-cases` e `GET /notifications`. O painel abre por clique no sino, fecha com Esc/clique fora, e marca leitura via `POST /notifications/:id/read` e `POST /notifications/read-all`.

### D9 — Sem troca de bibliotecas

Não introduzir Tailwind, TanStack Query nem outra UI kit nesta fase. Manter fetch + estado local + Zod.

### D10 — Configurações vs Equipe

O HTML tem “Configurações” (grade de cartões) e “Equipe e permissões” como views separadas. A API ainda não expõe `/users` nem `/roles`. Decisão: `/configuracoes` (e o alias legado `/integracoes`) renderiza seções com dados reais (unidades/cadeiras/profissionais de `GET /settings/context`, procedimentos, comissões, comunicações, integrações, branding, legal). A tabela de equipe lista apenas profissionais reais, com nota explícita sobre a ausência de endpoints de usuários/papéis — sem inventar RBAC no front.

### D11 — Seed rico idempotente

Dados fictícios populam as telas via `packages/database/prisma/seed.ts` + `seed-rich-data.ts` (UUIDv5 determinístico). Não há mock de UI. Regerar com `pnpm db:seed` (idempotente).

### D12 — Build e NODE_ENV

`NODE_ENV=development` no `.env` local (necessário ao Prisma/API em dev) quebra `next build` no Next 16 (`/_global-error` + `useContext`). Para build de produção, rodar com `env -u NODE_ENV` (ou `NODE_ENV=production`). Documentado para não confundir com regressão de código.

### D13 — Fluxos contextuais em modal

Tarefas, agenda, laboratório, anamnese, evolução, documentos, receitas, integrações, branding e etiquetas usam o `Modal` compartilhado. A Visão Diária permanece inalterada. Processos longos (prontuário e tratamento completo) continuam em página dedicada.

### D14 — Agenda: categoria, origem e etiquetas

`Appointment.category` representa categoria clínica. O campo existente `source` continua representando origem/automação. Etiquetas são entidades `AgendaTag` configuráveis por clínica e ligadas por `AppointmentTag`; assim, o termo “automática” não é tratado como especialidade.

### D15 — Lembrete WhatsApp sem falso positivo

`AppointmentReminder` registra antecedência e estado. Somente uma conexão Evolution ativa com credenciais persistidas gera evento `appointment.whatsapp-reminder.requested` na outbox. Sem configuração, o lembrete fica `DISABLED` com motivo explícito.

### D16 — Certificado e prescrições

Prescrições manuais são persistidas como `DRAFT` no prontuário. Assinatura não é oferecida sem
provedor/certificado. O upload A1 agora valida PKCS#12 e armazena arquivo/senha de forma privada;
isso não equivale a validar cadeia ICP-Brasil nem habilita assinatura automaticamente.

### D17 — Localização e campos de seleção

Valores de enums e payloads permanecem em inglês para compatibilidade; `presentationLabel` é a
fonte central de rótulos pt-BR. `SearchableSelect` implementa pesquisa, setas, Enter, Esc,
estado vazio/carregando e semântica combobox/listbox. Selects de alto volume e vínculos em
agenda, tarefas, laboratório e prontuário foram substituídos. Selects compactos de filtro e
listas estáticas curtas permanecem nativos por terem melhor comportamento móvel e não exigirem
pesquisa.

### D18 — Certificado A1 privado

Upload multipart operacional usa `FileObject`, arquivo privado local em desenvolvimento e senha
AES-256-GCM. O modelo bucket/objectKey mantém compatibilidade para adapter MinIO/S3; produção
distribuída não deve usar disco local. Detalhes e limites em `docs/certificado-a1.md`.

### D19 — Relatórios operacionais

`GET /reports/summary` aceita `clinicId`, `from` e `to` opcionalmente e agrega agenda por status
e profissional, ocupação estimada, pacientes, financeiro, tratamentos, comissões e comunicação.
O período padrão é de 30 dias e todas as consultas mantêm escopo organizacional.

## Contratos ainda pendentes

Ver `docs/api/pending-workspace-contracts.md` (payables, recorrências, cashflow, users/roles, regras de automação de retorno).
