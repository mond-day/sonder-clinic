# Auditoria do front-end — Sonder Clinic

**Data:** 5 de agosto de 2026  
**Escopo:** inventário obrigatório (Fase 0) antes da refatoração visual/funcional.

## Stack

| Item | Valor |
|---|---|
| Monorepo | pnpm 9.15 + Turborepo |
| Web | Next.js 16 (App Router), React 19 |
| Estilo | CSS global (`globals.css`), sem Tailwind |
| Formulários | React Hook Form disponível; mutações usam FormData + Zod |
| HTTP | `fetch` em `apps/web/src/lib/api.ts` com cookies `credentials: 'include'` |
| Auth | JWT + refresh em cookie HttpOnly (`/auth/login`, `/auth/refresh`, `/auth/logout`) |
| Multiunidade | `/settings/context` → clínicas/unidades/cadeiras; seleção em `localStorage` |
| Testes web | Vitest com `--passWithNoTests` (sem testes automatizados ainda) |

## Rotas atuais (`apps/web/src/app`)

| Rota | Componente | Dados |
|---|---|---|
| `/login` | `login/page.tsx` | Auth |
| `/` | `DashboardView` | agenda do dia, pacientes, `reports/summary` |
| `/[module]` | `ModuleView` + `ModuleActions` | módulos listados abaixo |
| `/legal/[policy]` | página legal | settings públicos |
| `/pacientes/[patientId]` | *(a criar)* | prontuário dedicado |

Módulos via `[module]`: `agenda`, `pacientes`, `tratamentos`, `documentos`, `financeiro`, `comissoes`, `comunicacao`, `integracoes`, `relatorios`.

## Componentes compartilhados

- `AppShell` — sidebar + topbar + mobile nav
- `AuthProvider` / `SelectionProvider`
- `DashboardView`, `ModuleView`, `ModuleActions`
- Sem design system de UI separado; tokens em CSS variables

## Matriz de contratos API (usados pelo front)

| Área | Método | Endpoint | Permissão típica | Consumidor |
|---|---|---|---|---|
| Auth | POST | `/auth/login` | pública | login |
| Auth | POST | `/auth/refresh` | cookie | AuthProvider, api retry |
| Auth | POST | `/auth/logout` | autenticado | AppShell |
| Contexto | GET | `/settings/context` | autenticado | SelectionProvider |
| Pacientes | GET | `/patients?clinicId&search` | `patient.view` | ModuleView, Dashboard, Actions |
| Pacientes | GET | `/patients/:id` | `patient.view` | *(prontuário)* |
| Pacientes | POST/PUT | `/patients`, `/patients/:id` | create/update | ModuleActions |
| Agenda | GET | `/appointments?from&to&clinicId` | scheduling | Dashboard, ModuleView |
| Agenda | POST/PUT | `/appointments`, `/appointments/:id` | scheduling | ModuleActions |
| Agenda | POST | `/appointments/:id/cancel` | scheduling | ModuleActions |
| Clínico | GET | `/patients/:id/clinical-record?clinicId` | `medical_record.view` | ModuleView tratamentos |
| Clínico | POST | `/patients/:id/clinical-entries` | `medical_record.create` | ModuleActions |
| Odontograma | GET/POST | `/patients/:id/odontograms` | view/create | ModuleView/Actions |
| Odontograma | GET | `/odontogram-conditions` | view | ModuleActions |
| Anamnese | GET | `/anamnesis/templates` | `anamnesis.view` | *(a consumir no prontuário)* |
| Anamnese | POST | `/patients/:id/anamnesis` | manage | *(a consumir)* |
| Tratamentos | GET | `/treatment-plans?clinicId&patientId` | `treatment.view` | ModuleView |
| Documentos | GET | `/documents?clinicId`, `/document-templates` | document.view | ModuleView |
| Financeiro | GET/POST | `/receivables`, `/receivables/:id/payments` | financial.* | ModuleView/Actions |
| Comissões | GET | `/commission-rules` | `commission.view_all` | ModuleView |
| Comunicação | GET | `/communication/deliveries` | integration.view | ModuleView |
| Relatórios | GET | `/reports/summary?clinicId` | report.view_management | Dashboard, ModuleView |
| Settings | GET/PUT | `/settings/branding`, `/settings/legal` | settings | ModuleActions |
| Integrações | GET/POST | `/integrations` | integration.* | ModuleView/Actions |

## Classificação vs plano técnico

| Recurso do plano | Status backend | Decisão de UI |
|---|---|---|
| Visão diária / Agenda / Pacientes | Existente | Migrar apresentação |
| Prontuário com abas | Parcial (endpoints por domínio) | Rota dedicada + adapters |
| Modo atendimento | Só apresentação | Feature flag de UI local |
| Anamnese / Odontograma / Evolução / Tratamentos / Documentos | Existente | Abas do prontuário |
| Financeiro paciente | Receivables existentes | Aba com filtro por `patientId` no client |
| Contas a pagar / recorrências / fluxo de caixa | **Inexistente** | Subnav + estado “aguardando API” |
| Comissões detalhadas | Só regras | Aba com regras reais; fechamento pendente |
| Central de retornos | **Inexistente** | Tela placeholder + contrato documentado |
| Tarefas / notificações consolidadas | **Inexistente** | Placeholder; drawer sem polling fictício |
| Laboratório & casos | **Inexistente** | Placeholder kanban vazio + contrato |

## Reauditoria estrutural/UX — 05/08/2026

- A busca em todo `apps/web` encontrou apresentação direta de enums em dashboard, prontuário,
  tratamentos, documentos, relatórios, comunicações, comissões e integrações. Esses pontos
  passaram a usar `presentationLabel`; datas, números e moedas usam `Intl` com `pt-BR`.
- Foram encontrados selects nativos em agenda, tarefas, laboratório, retornos, pacientes,
  financeiro, prontuário, configurações e shell. Vínculos de alto volume em agenda, tarefas,
  laboratório e prontuário usam `SearchableSelect`.
- Permaneceram nativos os filtros compactos de status/prioridade, o seletor global de clínica e
  listas estáticas curtas. A exceção é intencional: controles nativos têm melhor interação móvel
  para poucas opções e pesquisa adicionaria passos sem benefício.
- Formulários principais agora agrupam campos em disclosures acessíveis. A visão diária não teve
  sua composição visual alterada; somente rótulos de status foram localizados.
- Contratos confirmados: `Task` já possuía `patientId` e `category`; `ClinicalEntry` já possuía
  `treatmentId`; documentos e receitas já tinham persistência real. As mudanças foram aditivas
  nos DTOs e não alteraram enums ou payloads existentes.
- Novos contratos operacionais: certificado A1 em
  `GET/POST/DELETE /settings/certificate` e período opcional em
  `GET /reports/summary?clinicId&from&to`.
| Equipe e permissões | Parcial (RBAC API, sem CRUD UI) | Placeholder apontando settings |

## Baseline de qualidade (pré-mudança)

```text
pnpm --filter @sonder/web typecheck  → OK (05/08/2026)
API health localhost:4000            → indisponível no momento da auditoria
Web localhost:3000                   → indisponível no momento da auditoria
```

## Observações

1. Endpoints, nomes de campos e autenticação **não serão alterados**.
2. Mappers de apresentação ficam no front (`features/*/mappers` ou helpers locais).
3. Dados sensíveis de paciente em lista: mascarar CPF na UI; API continua retornando o que já retorna.
4. `localStorage` já guarda `clinicId` e `selectedPatientId`; modo atendimento usará chave separada sem persistir payload clínico.
