# HTML de referência — Sonder Clinic

## Precedência (obrigatória)

1. `02_ANAMNESE_EVOLUCAO_V2/` — Anamnese e Evolução (sobrescreve homônimos do pacote 01)
2. `01_WORKSPACE_APROVADO/modulos/` — demais módulos do workspace
3. `01_WORKSPACE_APROVADO/index.html` + `auditoria.html` — hub e auditoria

## Pacote 01 — Workspace aprovado

Origem: `/Users/mond.day/Downloads/sonder-clinic-prototipos-aprovacao`

| Arquivo | Uso na implementação |
|---|---|
| `modulos/agenda.html` | Detalhe em leitura → editar; métricas; board; WhatsApp/status |
| `modulos/pacientes.html` | Lista + menu “Mais ações”; prontuário/tabs |
| `modulos/odontograma.html` | 2D faces, ferramentas, painel do dente |
| `modulos/plano-tratamento.html` | Stepper, aprovação, geração financeira |
| `modulos/documentos.html` | Biblioteca + prévia paper + assinatura |
| `modulos/tarefas.html` | Kanban, checklist, view→edit |
| `modulos/laboratorios.html` | Kanban + timeline de estágios + parceiros |
| `modulos/financeiro.html` | Visão/AR/AP/comissões/recorrências/caixa |
| `modulos/relatorios.html` | Catálogo 15 + export XLSX/CSV/PDF |
| `modulos/usuarios-permissoes.html` | Usuários, perfis, matriz RBAC |
| `modulos/configuracoes.html` | Cards de status + integrações + auditoria |
| `modulos/anamnese.html` | **Ignorar** — usar V2 |
| `modulos/evolucao.html` | **Ignorar** — usar V2 |

Fidelidade: comportamento + hierarquia (não pixel-perfect). Converter para padrões Next.js existentes.

## Pacote 02 — Anamnese / Evolução V2

Origem: `/Users/mond.day/Downloads/sonder-clinic-anamnese-evolucao-v2`
