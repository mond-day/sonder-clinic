# Sonder Clinic — Plano Técnico de Refatoração do Front-end

**Direção visual aprovada:** Workspace Clínico, derivado do Modelo 2  
**Objetivo:** transformar o sistema em um workspace odontológico profissional, denso, organizado e adequado para uso diário em desktop, sem aparência de aplicativo genérico e sem quebrar integrações existentes.  
**Data da análise:** 5 de agosto de 2026  
**Protótipo de referência:** `sonder-clinic-workspace-v3.html`

---

## 1. Estado verificado do repositório

O repositório `mond-day/sonder-clinic` está público e possui apenas a branch `main`, porém, no momento desta análise, o GitHub reporta tamanho `0` e não retorna arquivos como `package.json`, páginas, componentes, serviços, hooks ou contratos de API.

Consequências técnicas:

1. Não foi possível fazer o mapeamento arquivo por arquivo do front-end atual.
2. Não foi possível identificar com segurança:
   - versão do Next.js;
   - uso de App Router ou Pages Router;
   - biblioteca de componentes;
   - estratégia de estado e cache;
   - cliente HTTP;
   - modelos TypeScript;
   - endpoints e DTOs reais;
   - autenticação e autorização;
   - regras de multiunidade;
   - testes existentes.
3. Nenhum endpoint, nome de campo ou estrutura de pasta deste documento deve ser tratado como contrato já existente.
4. Antes de implementar, o Cursor deve executar a etapa **Fase 0 — Inventário obrigatório do projeto** descrita neste documento.

> Regra: não inventar contratos de backend para “fazer a tela funcionar”. Primeiro mapear o que existe; depois criar adaptadores entre os contratos existentes e o novo modelo de apresentação.

---

## 2. Resultado esperado

O front-end deve funcionar como um sistema clínico e administrativo de uso intensivo, com as seguintes características:

- navegação lateral persistente em desktop;
- telas com hierarquia visual de sistema de gestão, não de aplicativo mobile ampliado;
- tabelas, filtros, painéis e formulários contextuais;
- prontuário do paciente aberto em uma tela exclusiva;
- nenhuma lista de outros pacientes visível dentro do prontuário aberto;
- modo de atendimento para ocultar informações administrativas ou financeiras quando a tela estiver sendo mostrada ao paciente;
- financeiro dividido em áreas operacionais;
- central de retornos com alertas e ações;
- central de tarefas com responsáveis, prazo, prioridade e recorrência;
- notificações consolidadas na barra lateral e no topo;
- controle laboratorial para prótese, ortodontia e implantodontia;
- rastreamento de status clínicos e laboratoriais vinculados ao paciente;
- manutenção dos contratos atuais com APIs, autenticação e regras de permissão;
- experiência responsiva, priorizando desktop e tablet para operação clínica.

---

## 3. Princípios de produto e UX

### 3.1 Workspace, não “app genérico”

Evitar:

- cards grandes demais com pouca informação;
- excesso de espaços vazios;
- formulários centralizados sem contexto;
- navegação baseada apenas em modais;
- ícones decorativos sem significado operacional;
- dashboards com números sem ação associada;
- visual semelhante a template de SaaS genérico.

Priorizar:

- densidade moderada de informação;
- contexto clínico ao lado da ação;
- tabelas com filtros e ações rápidas;
- formulários em modal ou drawer apenas quando não houver perda de contexto;
- páginas completas para processos complexos;
- status claros, consistentes e sem depender exclusivamente de cor;
- hierarquia tipográfica discreta;
- superfícies brancas sobre fundo cinza-claro;
- navegação verde-petróleo, mantendo aparência clínica e profissional.

### 3.2 Prontuário isolado

Ao pesquisar e abrir um paciente:

1. A lista de pacientes deve desaparecer.
2. O sistema deve abrir uma rota ou estado de página dedicado ao paciente.
3. Nenhum nome ou dado de outro paciente deve permanecer visível.
4. O cabeçalho deve mostrar somente:
   - nome;
   - idade;
   - código interno;
   - ações do paciente atual;
   - indicadores clínicos permitidos.
5. O prontuário deve usar as abas:
   - Resumo;
   - Anamnese;
   - Odontograma;
   - Tratamentos;
   - Evolução;
   - Financeiro;
   - Documentos.

### 3.3 Privacidade durante o atendimento

Criar o **Modo Atendimento**.

Ao ativar:

- ocultar aba Financeiro;
- ocultar resumo financeiro do paciente;
- ocultar menus administrativos;
- ocultar CPF completo, telefone e dados de contato que não sejam necessários;
- ocultar notas internas marcadas como restritas;
- manter informações clínicas necessárias para o atendimento;
- exibir indicação visual de que o modo está ativo;
- não alterar permissões reais nem o payload retornado pela API; apenas controlar apresentação conforme autorização e contexto.

O modo não substitui controle de acesso. As permissões do backend continuam sendo a fonte de verdade.

### 3.4 Ação com contexto

Ao agendar um atendimento, mostrar de forma discreta:

- tratamento atual;
- alerta de saúde relevante;
- retorno pendente;
- pendência laboratorial;
- pendência financeira, somente para usuários autorizados;
- conflito de profissional, consultório ou cadeira.

Ao criar uma solicitação laboratorial, mostrar:

- paciente;
- plano de tratamento;
- procedimento;
- profissional;
- região ou elemento;
- laboratório;
- anexos;
- prazo;
- retorno futuro do paciente.

---

## 4. Arquitetura de informação aprovada

### 4.1 Navegação principal

#### Operação

- Visão diária
- Agenda
- Pacientes
- Central de retornos

#### Clínica

- Tarefas
- Laboratório & casos
- Financeiro
- Relatórios

#### Administração

- Equipe e permissões
- Configurações

### 4.2 Indicadores na navegação

A barra lateral deve aceitar badges numéricos e por criticidade:

- Central de retornos: quantidade pendente ou vencida;
- Tarefas: pendentes e atrasadas;
- Laboratório & casos: casos com prazo ou ação necessária;
- alertas críticos: badge vermelho;
- pendências normais: badge laranja;
- informativos: badge verde/azulado.

Não somar indiscriminadamente todos os registros. A contagem deve representar itens acionáveis para o usuário atual e respeitar unidade, papel e permissões.

---

## 5. Design system

### 5.1 Tokens visuais

Usar os tokens do protótipo como ponto de partida:

```css
:root {
  --canvas: #edf2f2;
  --nav: #153d46;
  --nav-deep: #102f36;
  --surface: #ffffff;
  --surface-soft: #f7f9f9;
  --ink: #183139;
  --muted: #6a7d83;
  --line: #dce5e6;
  --accent: #159a96;
  --accent-dark: #117873;
  --accent-soft: #dcf4f1;
  --success: #368764;
  --warning: #b6771e;
  --danger: #c7505c;
  --info: #3d78ce;
  --radius-lg: 16px;
  --radius-md: 11px;
}
```

Implementar em tokens da solução já usada pelo projeto:

- CSS variables;
- Tailwind theme;
- design tokens próprios;
- tema da biblioteca existente.

Não adicionar outra biblioteca de UI antes de verificar a atual.

### 5.2 Tipografia

- fonte base: Inter ou a fonte já definida no projeto;
- títulos de página: 24–28 px;
- títulos de painel: 14–17 px;
- corpo: 13–14 px;
- metadados: 10–12 px;
- evitar textos em caixa alta, exceto rótulos curtos e cabeçalhos de tabela;
- usar pesos 500–800 de forma controlada.

### 5.3 Componentes básicos

Criar ou padronizar:

- `AppShell`
- `Sidebar`
- `Topbar`
- `GlobalSearch`
- `PageHeader`
- `PageActions`
- `Panel`
- `PanelHeader`
- `MetricCard`
- `StatusBadge`
- `NotificationBadge`
- `DataTable`
- `TableFilters`
- `EmptyState`
- `ErrorState`
- `LoadingSkeleton`
- `Drawer`
- `Modal`
- `ConfirmDialog`
- `FormSection`
- `FormField`
- `ContextAlert`
- `Timeline`
- `Tabs`
- `SegmentedControl`
- `PermissionGuard`
- `SensitiveContent`

### 5.4 Estados obrigatórios

Cada tela deve ter:

- carregamento;
- vazio;
- erro recuperável;
- erro de permissão;
- sucesso;
- estado offline ou falha de conexão, caso o projeto já trate isso;
- paginação ou carregamento incremental;
- filtros preservados na URL quando fizer sentido.

---

## 6. Rotas propostas

Adaptar à estrutura real do projeto. Não migrar de Pages Router para App Router apenas por causa desta refatoração.

```text
/dashboard
/agenda
/pacientes
/pacientes/[patientId]
/pacientes/[patientId]/resumo
/pacientes/[patientId]/anamnese
/pacientes/[patientId]/odontograma
/pacientes/[patientId]/tratamentos
/pacientes/[patientId]/evolucao
/pacientes/[patientId]/financeiro
/pacientes/[patientId]/documentos
/retornos
/tarefas
/laboratorio
/financeiro
/financeiro/contas-a-receber
/financeiro/contas-a-pagar
/financeiro/comissoes
/financeiro/recorrencias
/financeiro/fluxo-de-caixa
/relatorios
/equipe
/configuracoes
```

Se o projeto já usa rotas diferentes, preservar URLs públicas e criar:

- redirecionamentos compatíveis;
- aliases;
- navegação interna para as rotas existentes;
- migração incremental, sem quebra de links salvos.

---

## 7. Shell do sistema

### 7.1 Sidebar

Requisitos:

- fixa em desktop;
- recolhível ou drawer em telas menores;
- agrupamento por contexto;
- item ativo evidente;
- badge com quantidade;
- seletor de unidade no topo;
- perfil e papel no rodapé;
- central de alertas acessível sem troca de página.

### 7.2 Topbar

Deve conter:

- pesquisa global;
- atalho de teclado `Ctrl/Cmd + K`;
- tarefas;
- notificações;
- botão “Novo” com atalhos contextuais;
- menu da unidade ou perfil quando necessário.

A pesquisa global deve aceitar:

- nome;
- CPF;
- telefone;
- código interno;
- procedimento;
- eventualmente documento, caso a API permita.

Nunca realizar busca ampla contendo dados sensíveis no cliente se o backend possuir endpoint seguro de pesquisa.

---

## 8. Visão diária

### 8.1 Objetivo

Entregar uma tela operacional, não apenas gerencial.

### 8.2 Conteúdo

- atendimentos do dia;
- confirmados;
- sala de espera;
- atrasos;
- retornos pendentes;
- prazos de laboratório;
- tarefas prioritárias;
- resumo financeiro conforme permissão;
- conflitos ou bloqueios de cadeira;
- pacientes com anamnese ou documento pendente.

### 8.3 Interações

- abrir ficha do paciente;
- alterar status do atendimento;
- iniciar atendimento;
- marcar chegada;
- enviar confirmação;
- abrir retorno;
- resolver tarefa;
- abrir caso laboratorial;
- registrar pagamento, conforme permissão.

---

## 9. Agenda

### 9.1 Visualizações

- dia;
- semana;
- profissional;
- cadeira ou consultório;
- unidade;
- opcionalmente lista para mobile.

### 9.2 Regras

- verificar conflito de profissional;
- verificar conflito de cadeira compartilhada;
- respeitar duração do procedimento;
- permitir bloqueio e compromisso recorrente;
- diferenciar consulta, bloqueio, tarefa e prazo laboratorial;
- permitir status configuráveis;
- preservar timezone da clínica;
- não converter datas localmente de maneira que altere o dia no Mato Grosso.

### 9.3 Status sugeridos

```ts
type AppointmentStatus =
  | 'scheduled'
  | 'confirmation_pending'
  | 'confirmed'
  | 'arrived'
  | 'waiting'
  | 'in_service'
  | 'completed'
  | 'no_show'
  | 'cancelled';
```

Mapear estes estados aos valores reais do backend por meio de adaptador.

---

## 10. Pacientes

### 10.1 Tela de pesquisa

A tela inicial de pacientes deve conter:

- busca principal;
- filtros por status;
- unidade;
- profissional;
- tratamento;
- retorno pendente;
- pendência financeira, conforme permissão;
- paginação;
- tabela com dados mínimos.

Colunas recomendadas:

- paciente;
- contato;
- última consulta;
- tratamento atual;
- próxima ação;
- status;
- ação “Abrir prontuário”.

Não exibir informações médicas sensíveis na lista geral.

### 10.2 Abertura do prontuário

Preferência: rota dedicada `/pacientes/[patientId]`.

Evitar manter o prontuário apenas como painel ao lado da lista. Isso reduz privacidade, espaço útil e clareza.

### 10.3 Cabeçalho do paciente

Exibir:

- avatar ou iniciais;
- nome;
- idade;
- código interno;
- última atualização;
- WhatsApp;
- editar cadastro;
- agendar;
- modo atendimento.

### 10.4 Aba Resumo

Deve consolidar:

- tratamento atual;
- profissional responsável;
- próxima consulta;
- alertas de saúde;
- odontograma resumido;
- últimas evoluções;
- ações pendentes;
- retorno recomendado;
- resumo financeiro somente para perfis autorizados.

### 10.5 Aba Anamnese

- modelos preenchidos;
- status de assinatura;
- data;
- versão;
- alertas gerados;
- enviar link;
- preencher internamente;
- imprimir ou gerar PDF;
- histórico imutável quando exigido;
- registro de auditoria.

### 10.6 Aba Odontograma

- dentição permanente e decídua;
- seleção de dente, face ou região;
- legenda configurável;
- procedimento pendente;
- concluído;
- acompanhamento;
- histórico;
- vínculo com orçamento, tratamento e evolução;
- sem depender apenas de vermelho e verde para acessibilidade.

### 10.7 Aba Tratamentos

- planos ativos e concluídos;
- procedimentos;
- etapas;
- profissional;
- progresso;
- custo e valor, conforme permissão;
- gatilho para solicitação laboratorial;
- orçamento relacionado;
- status clínico.

### 10.8 Aba Evolução

- linha do tempo;
- data e hora;
- profissional;
- tratamento relacionado;
- texto;
- anexos;
- registro por áudio, se existir;
- assinatura digital, se existir;
- edição conforme regras de auditoria;
- histórico de alteração.

### 10.9 Aba Financeiro

- plano contratado;
- cobranças;
- parcelas;
- vencimentos;
- pagamentos;
- descontos;
- renegociações;
- recibos;
- saldo;
- responsável financeiro;
- permissões específicas.

### 10.10 Aba Documentos

- pastas;
- fotos;
- exames;
- radiografias;
- termos;
- contratos;
- receitas;
- atestados;
- assinatura;
- compartilhamento seguro;
- visualização e download conforme permissão;
- limite, tipo e tamanho de arquivo validados no cliente e no servidor.

---

## 11. Central de retornos

### 11.1 Objetivo

Evitar que retorno clínico fique misturado com consulta já agendada ou com uma simples anotação.

### 11.2 Estados

```ts
type ReturnAlertStatus =
  | 'pending'
  | 'due_today'
  | 'overdue'
  | 'contacted'
  | 'patient_replied'
  | 'scheduled'
  | 'postponed'
  | 'dismissed';
```

### 11.3 Dados mínimos

```ts
interface ReturnAlert {
  id: string;
  clinicId: string;
  unitId: string;
  patientId: string;
  appointmentId?: string;
  treatmentId?: string;
  procedureId?: string;
  specialty?: string;
  reason: string;
  dueAt: string;
  status: ReturnAlertStatus;
  assignedToUserId?: string;
  preferredChannel?: 'whatsapp' | 'phone' | 'email';
  contactAttempts: number;
  lastContactAt?: string;
  scheduledAppointmentId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

Não adotar esta interface sem mapear o backend. Ela é um modelo de domínio para orientar o adaptador.

### 11.4 Geração automática

Permitir regras configuráveis por:

- procedimento;
- especialidade;
- status do tratamento;
- término de consulta;
- cirurgia;
- manutenção ortodôntica;
- instalação de prótese;
- retorno de trabalho do laboratório;
- prevenção periódica.

### 11.5 Ações

- WhatsApp;
- ligação;
- agendar;
- adiar;
- atribuir responsável;
- registrar tentativa;
- concluir;
- abrir prontuário.

O alerta não deve criar consulta automaticamente sem ação explícita, salvo regra de negócio já existente e validada.

---

## 12. Tarefas e notificações

### 12.1 Central de tarefas

Visualizações:

- Entrada;
- Hoje;
- Próximas;
- Concluídas;
- Minhas tarefas;
- Tarefas da equipe.

### 12.2 Modelo sugerido

```ts
type TaskStatus = 'inbox' | 'todo' | 'in_progress' | 'done' | 'cancelled';
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
type TaskContextType =
  | 'patient'
  | 'appointment'
  | 'return_alert'
  | 'lab_case'
  | 'finance_entry'
  | 'inventory'
  | 'administrative';

interface ClinicTask {
  id: string;
  clinicId: string;
  unitId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: string;
  assignedToUserId?: string;
  createdByUserId: string;
  contextType?: TaskContextType;
  contextId?: string;
  patientId?: string;
  recurrenceRule?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 12.3 Notificações

A central de alertas deve consolidar eventos acionáveis de:

- retornos;
- tarefas;
- laboratório;
- agenda;
- financeiro;
- anamnese;
- documentos;
- integrações.

Separar:

- notificação informativa;
- pendência operacional;
- alerta crítico.

Não usar polling agressivo. Preferir a infraestrutura existente:

- WebSocket;
- Server-Sent Events;
- invalidação por eventos;
- polling com intervalo adequado;
- atualização manual.

---

## 13. Laboratório & casos

### 13.1 Escopo

O módulo deve atender, no mínimo:

- prótese;
- ortodontia;
- implantodontia.

### 13.2 Quadro de status

Sugestão inicial:

```ts
type LabCaseStatus =
  | 'planning'
  | 'awaiting_send'
  | 'sent_to_lab'
  | 'in_production'
  | 'returned_to_clinic'
  | 'adjustment_required'
  | 'resent_to_lab'
  | 'ready_for_installation'
  | 'installed'
  | 'completed'
  | 'cancelled';
```

A interface pode agrupar estados técnicos em cinco colunas visuais:

1. Planejamento
2. Aguardando envio
3. No laboratório
4. Retornou à clínica
5. Instalado / concluído

Estados como ajuste e reenvio devem permanecer no histórico e podem aparecer em uma coluna específica se o volume justificar.

### 13.3 Dados mínimos

```ts
interface LabCase {
  id: string;
  clinicId: string;
  unitId: string;
  patientId: string;
  professionalId: string;
  treatmentId?: string;
  procedureId?: string;
  specialty: 'prosthodontics' | 'orthodontics' | 'implantology' | string;
  laboratoryId?: string;
  serviceName: string;
  region?: string;
  toothNumbers?: number[];
  shade?: string;
  material?: string;
  status: LabCaseStatus;
  sentAt?: string;
  expectedAt?: string;
  returnedAt?: string;
  installedAt?: string;
  nextAppointmentId?: string;
  notes?: string;
  attachments?: Array<{ id: string; name: string; url?: string }>;
  createdAt: string;
  updatedAt: string;
}
```

### 13.4 Automações

- ao aprovar tratamento configurado, sugerir criação do caso;
- ao enviar ao laboratório, exigir data de envio e prazo;
- ao definir prazo, criar tarefa ou alerta;
- quando retornar à clínica, verificar consulta futura;
- sem consulta futura, gerar alerta de retorno;
- ao solicitar ajuste, manter histórico e novo prazo;
- ao instalar, vincular evolução clínica e concluir o caso.

### 13.5 Auditoria

Cada transição deve registrar:

- status anterior;
- status novo;
- usuário;
- data e hora;
- observação;
- anexos;
- prazo alterado;
- laboratório;
- vínculo com tarefa ou retorno.

---

## 14. Financeiro

### 14.1 Separação funcional

Criar as áreas:

1. Visão geral
2. Contas a receber
3. Contas a pagar
4. Comissões
5. Recorrências
6. Fluxo de caixa

### 14.2 Visão geral

Indicadores:

- recebido no período;
- pago no período;
- a receber;
- a pagar;
- em atraso;
- resultado realizado;
- resultado previsto;
- inadimplência;
- margem;
- ticket médio;
- comparativo com período anterior.

### 14.3 Contas a receber

Campos e filtros:

- paciente ou origem;
- tratamento;
- parcela;
- competência;
- vencimento;
- valor original;
- desconto;
- juros;
- valor pago;
- saldo;
- forma de pagamento;
- conta;
- status;
- unidade;
- profissional;
- recorrência;
- documento ou recibo.

Ações:

- receber;
- receber em lote;
- parcelar;
- renegociar;
- aplicar desconto;
- registrar juros;
- estornar;
- emitir recibo;
- enviar cobrança;
- conciliar.

### 14.4 Contas a pagar

Campos e filtros:

- fornecedor;
- descrição;
- categoria;
- centro de custo;
- competência;
- vencimento;
- valor;
- parcela;
- recorrência;
- conta bancária;
- status;
- unidade;
- documento anexo.

Ações:

- pagar;
- pagar em lote;
- parcelar;
- recorrência;
- estornar;
- anexar comprovante;
- conciliar.

### 14.5 Comissões

Permitir regras por:

- percentual;
- valor fixo;
- profissional;
- especialidade;
- procedimento;
- convênio;
- unidade;
- pagamento do paciente;
- finalização do procedimento;
- desconto de custo;
- desconto de taxa de cartão.

Exibir detalhe por:

- paciente;
- procedimento;
- valor base;
- custo;
- taxa;
- regra aplicada;
- comissão calculada;
- status de aprovação;
- pagamento;
- recibo.

Não recalcular comissões antigas silenciosamente quando uma regra for editada.

### 14.6 Recorrências

Suportar:

- receita recorrente;
- despesa recorrente;
- mensalidade de ortodontia;
- aluguel;
- energia estimada;
- softwares;
- contratos;
- frequência mensal, semanal ou personalizada;
- data final;
- pausa;
- reajuste;
- próxima geração;
- histórico de lançamentos gerados.

### 14.7 Fluxo de caixa

Exibir:

- realizado;
- previsto;
- entradas;
- saídas;
- saldo acumulado;
- conta;
- categoria;
- centro de custo;
- competência;
- caixa por unidade;
- conciliação.

### 14.8 Modelo lógico de lançamento

```ts
type FinanceEntryType = 'receivable' | 'payable' | 'transfer';
type FinanceEntryStatus =
  | 'draft'
  | 'pending'
  | 'due_today'
  | 'overdue'
  | 'partially_paid'
  | 'paid'
  | 'cancelled'
  | 'refunded';

interface FinanceEntry {
  id: string;
  clinicId: string;
  unitId?: string;
  type: FinanceEntryType;
  status: FinanceEntryStatus;
  description: string;
  patientId?: string;
  supplierId?: string;
  treatmentId?: string;
  categoryId?: string;
  costCenterId?: string;
  accountId?: string;
  competenceDate?: string;
  dueDate?: string;
  originalAmount: number;
  discountAmount?: number;
  interestAmount?: number;
  paidAmount?: number;
  installmentNumber?: number;
  installmentCount?: number;
  recurrenceId?: string;
  createdAt: string;
  updatedAt: string;
}
```

Valores monetários não devem ser tratados com ponto flutuante sem estratégia definida. Usar o padrão existente do backend, preferencialmente decimal serializado ou inteiro em centavos.

---

## 15. Relatórios

Biblioteca inicial:

- produção por profissional;
- produção por especialidade;
- agenda e ocupação;
- faltas e cancelamentos;
- eficiência de retornos;
- conversão de avaliações;
- origem de pacientes;
- tratamentos em andamento;
- prazos de laboratório;
- retrabalho laboratorial;
- recebimentos;
- despesas;
- resultado financeiro;
- inadimplência;
- comissões;
- recorrências;
- comparação entre unidades.

Requisitos:

- filtros por período;
- unidade;
- profissional;
- especialidade;
- status;
- exportação;
- timezone consistente;
- filtros refletidos na URL;
- permissão por relatório;
- não carregar bases completas no navegador para agregar localmente.

---

## 16. Estratégia para preservar APIs e regras existentes

### 16.1 Regra de ouro

A refatoração deve ser **presentation-first**, não uma reescrita do domínio.

Não fazer sem necessidade comprovada:

- renomear endpoint;
- alterar método HTTP;
- mudar DTO;
- alterar autenticação;
- trocar biblioteca de cache;
- trocar tratamento de erro;
- alterar paginação;
- alterar timezone;
- mover regra de negócio do backend para o cliente;
- duplicar chamadas em componentes novos.

### 16.2 Camada de adaptação

Quando o formato da API não coincidir com o formato ideal da UI:

```text
API response
   ↓
service/repository existente
   ↓
mapper ou adapter de apresentação
   ↓
view model tipado
   ↓
componentes
```

Exemplo:

```ts
interface PatientSummaryViewModel {
  id: string;
  displayName: string;
  initials: string;
  ageLabel: string;
  currentTreatmentLabel?: string;
  nextAppointmentLabel?: string;
  healthAlerts: Array<{
    id: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description?: string;
  }>;
}

function mapPatientToSummaryViewModel(apiPatient: ExistingPatientDto): PatientSummaryViewModel {
  // Mapear sem alterar ExistingPatientDto.
}
```

### 16.3 Contrato de requisição

Para cada integração existente, registrar antes da mudança:

| Área | Hook/service atual | Método | Endpoint | Request DTO | Response DTO | Cache key | Permissão | Consumidores |
|---|---|---|---|---|---|---|---|---|
| Pacientes | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear |
| Agenda | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear |
| Financeiro | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear |
| Documentos | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear | A mapear |

O Cursor deve preencher esta tabela em um arquivo de auditoria antes da refatoração.

### 16.4 Funcionalidade sem backend

Se uma função do protótipo ainda não possuir suporte no backend:

- não criar fake permanente no fluxo de produção;
- implementar interface atrás de feature flag;
- documentar endpoint necessário;
- usar mock somente em Storybook, teste ou ambiente de protótipo;
- manter botão desabilitado com explicação, se apropriado;
- criar contrato técnico para o backend separadamente.

---

## 17. Estrutura sugerida para Next.js

Adaptar ao repositório real.

```text
src/
  app/ ou pages/
    ...rotas existentes
  components/
    ui/
    layout/
    data-table/
    forms/
    feedback/
  features/
    dashboard/
    appointments/
    patients/
      components/
      hooks/
      mappers/
      schemas/
      services/
      types/
    returns/
    tasks/
    lab-cases/
    finance/
    reports/
  lib/
    api/
    auth/
    permissions/
    dates/
    currency/
    validation/
  styles/
  tests/
```

Se o repositório já estiver organizado por domínio, não mover tudo apenas para seguir esta árvore.

---

## 18. Estado, cache e formulários

### 18.1 Estado remoto

Manter a ferramenta existente. Caso ainda não exista, avaliar TanStack Query.

Princípios:

- chaves de cache por clínica, unidade e filtros;
- invalidação específica;
- atualização otimista apenas quando segura;
- não duplicar cache global e cache local;
- evitar chamada por linha de tabela;
- pré-carregar prontuário ao passar sobre resultado, somente se custo aceitável;
- abortar buscas antigas.

### 18.2 Formulários

Manter biblioteca existente. Caso não exista, avaliar React Hook Form + Zod.

Requisitos:

- máscaras brasileiras;
- validação no cliente e servidor;
- mensagens próximas ao campo;
- preservação de formulário em falha de rede;
- bloqueio de duplo envio;
- indicação de salvamento;
- confirmação para perda de alterações;
- acessibilidade de labels e erros;
- formulários complexos divididos em seções, não em uma coluna longa genérica.

---

## 19. Permissões e LGPD

### 19.1 Permissões sugeridas

- visualizar pacientes;
- editar cadastro;
- visualizar anamnese;
- editar anamnese;
- visualizar odontograma;
- editar odontograma;
- visualizar evolução;
- registrar evolução;
- visualizar documentos;
- enviar documentos;
- visualizar financeiro do paciente;
- receber pagamento;
- visualizar contas a pagar;
- pagar despesa;
- visualizar comissões;
- aprovar comissões;
- administrar tarefas;
- administrar laboratório;
- administrar configurações;
- acessar relatórios.

### 19.2 Regras

- o front-end não é a única barreira de permissão;
- backend deve validar tudo;
- ocultar menus não substitui autorização;
- dados sensíveis não devem ser enviados desnecessariamente;
- registrar auditoria de alterações clínicas e financeiras;
- URLs de documentos devem ser temporárias ou protegidas;
- não persistir dados clínicos completos em `localStorage` sem necessidade e avaliação de risco;
- mascarar CPF e contatos em listas gerais;
- modo atendimento não deve revelar informações carregadas por inspeção DOM quando a permissão não existir.

---

## 20. Responsividade

### Desktop, a partir de 1180 px

- sidebar fixa;
- tabelas completas;
- painéis em duas colunas;
- agenda semanal;
- kanban horizontal.

### Tablet, 768–1179 px

- sidebar em drawer ou compacta;
- painéis em uma coluna;
- tabelas com rolagem;
- agenda por dia ou semana rolável;
- prontuário em largura total.

### Mobile, abaixo de 768 px

- barra inferior com cinco destinos principais;
- listas substituem tabelas quando necessário;
- filtros em drawer;
- agenda em lista/dia;
- ações principais fixas ou acessíveis;
- odontograma com zoom/rolagem;
- kanban rolável ou alternado por coluna;
- não tentar reproduzir a densidade inteira do desktop.

---

## 21. Acessibilidade

- contraste WCAG AA;
- foco visível;
- navegação por teclado;
- `aria-label` em botões de ícone;
- textos de status além da cor;
- cabeçalhos semânticos;
- tabelas com cabeçalhos corretos;
- modal com foco preso e retorno ao gatilho;
- `Esc` para fechar;
- mensagens de erro anunciadas;
- campos associados a labels;
- áreas clicáveis com pelo menos 40 px quando possível.

---

## 22. Performance

- dividir bundles por domínio;
- carregar odontograma e documentos sob demanda;
- virtualizar listas extensas quando necessário;
- paginação no servidor;
- debounce de busca;
- otimizar imagens;
- evitar gráficos pesados no primeiro carregamento;
- skeletons estáveis para reduzir layout shift;
- monitorar Core Web Vitals;
- não carregar todas as abas do prontuário com todas as requisições de uma vez sem necessidade.

Estratégia recomendada para prontuário:

1. carregar cabeçalho e resumo;
2. carregar aba ativa;
3. pré-carregar abas adjacentes conforme intenção;
4. manter cache por paciente com controle de invalidação.

---

## 23. Testes

### 23.1 Unitários

- mappers e formatadores;
- regras de badge;
- cálculo visual de status;
- máscaras;
- validações;
- guards de permissão;
- transições de status laboratorial;
- filtros de retorno.

### 23.2 Integração

- pesquisa de pacientes;
- abertura do prontuário;
- troca de abas;
- criação de atendimento;
- recebimento financeiro;
- criação de retorno;
- criação de tarefa;
- transição de caso laboratorial;
- upload e listagem de documentos.

### 23.3 E2E

Fluxos mínimos:

1. login → visão diária;
2. pesquisar paciente → abrir prontuário;
3. ativar modo atendimento → validar ocultação;
4. agendar paciente → verificar conflito;
5. registrar evolução;
6. criar alerta de retorno → agendar;
7. criar tarefa vinculada ao paciente;
8. criar solicitação laboratorial → mover para laboratório;
9. marcar retorno à clínica → gerar alerta se não houver consulta;
10. receber parcela;
11. lançar conta a pagar;
12. revisar comissão;
13. validar permissões de recepção e dentista.

### 23.4 Contrato de API

- snapshots ou schemas dos DTOs;
- testes para serialização de datas;
- testes monetários;
- testes de paginação;
- testes de erro 401, 403, 404, 409 e 422;
- teste para não enviar campos removidos ou renomeados.

### 23.5 Regressão visual

Capturar:

- dashboard desktop;
- pacientes desktop;
- prontuário em cada aba;
- modo atendimento;
- financeiro;
- retornos;
- tarefas;
- laboratório;
- agenda tablet;
- prontuário mobile.

---

## 24. Fases de implementação

### Fase 0 — Inventário obrigatório

Antes de editar:

1. identificar gerenciador de pacotes;
2. identificar framework e versão;
3. identificar App Router ou Pages Router;
4. listar rotas;
5. listar componentes compartilhados;
6. localizar cliente HTTP;
7. localizar hooks e services;
8. localizar DTOs e schemas;
9. localizar autenticação;
10. localizar permissões;
11. localizar unidade/tenant;
12. localizar testes;
13. executar lint, typecheck, testes e build atuais;
14. salvar resultado em `docs/frontend-audit.md`;
15. preencher matriz de contratos de API.

Se o repositório continuar vazio, não iniciar implementação fictícia. Registrar bloqueio claramente.

### Fase 1 — Fundação visual

- tokens;
- shell;
- sidebar;
- topbar;
- botões;
- badges;
- painéis;
- tabelas;
- filtros;
- feedback;
- layout responsivo.

### Fase 2 — Visão diária e agenda

- migrar apresentação;
- preservar hooks;
- adicionar contexto;
- testar conflitos;
- testar status.

### Fase 3 — Pacientes e prontuário

Prioridade máxima:

- pesquisa;
- rota dedicada;
- cabeçalho;
- abas;
- modo atendimento;
- resumo;
- anamnese;
- odontograma;
- tratamentos;
- evolução;
- financeiro;
- documentos.

### Fase 4 — Financeiro

- separar módulos;
- contas a receber;
- contas a pagar;
- comissões;
- recorrências;
- fluxo de caixa;
- permissões;
- testes monetários.

### Fase 5 — Retornos, tarefas e alertas

- central de retornos;
- regras;
- tarefas;
- badges;
- central de alertas;
- ações rápidas.

### Fase 6 — Laboratório & casos

- domínio;
- quadro;
- histórico;
- prazos;
- integração com agenda;
- integração com retornos;
- integração com tratamento.

### Fase 7 — Relatórios e acabamento

- relatórios;
- performance;
- acessibilidade;
- regressão visual;
- QA completo;
- documentação.

---

## 25. Critérios de aceite

### Geral

- [ ] Build de produção concluído.
- [ ] Typecheck sem novos erros.
- [ ] Lint sem novos erros.
- [ ] Testes existentes continuam passando.
- [ ] Nenhuma chamada de API existente foi alterada sem justificativa documentada.
- [ ] Nenhuma regra de permissão foi enfraquecida.
- [ ] Datas mantêm o timezone correto.
- [ ] Valores monetários mantêm precisão.
- [ ] Layout funciona em desktop, tablet e mobile.

### Pacientes

- [ ] Pesquisa retorna resultados sem expor dados clínicos.
- [ ] Prontuário abre sem lista lateral de outros pacientes.
- [ ] Abas exigidas estão disponíveis.
- [ ] Modo atendimento oculta áreas sensíveis.
- [ ] Acesso direto por URL funciona.
- [ ] Recarregar a página mantém o paciente e a aba.

### Financeiro

- [ ] Contas a receber e pagar são separadas.
- [ ] Comissões possuem detalhe.
- [ ] Recorrências têm próxima execução e histórico.
- [ ] Fluxo de caixa diferencia realizado e previsto.
- [ ] Permissões financeiras são aplicadas.

### Retornos e tarefas

- [ ] Badge reflete itens acionáveis.
- [ ] Retorno pode ser contatado, adiado e agendado.
- [ ] Tarefa possui responsável, prazo e prioridade.
- [ ] Tarefa pode ter recorrência.
- [ ] Notificações abrem o contexto correto.

### Laboratório

- [ ] Caso está vinculado ao paciente.
- [ ] Caso pode estar vinculado ao tratamento.
- [ ] Prazo gera alerta ou tarefa.
- [ ] Retorno à clínica verifica agendamento.
- [ ] Ajustes e reenvios preservam histórico.
- [ ] Instalação conclui o ciclo sem apagar etapas.

---

## 26. Instrução pronta para o Cursor

Copiar o bloco abaixo junto com este documento e o HTML de referência.

```text
Analise completamente este repositório antes de alterar qualquer arquivo.

Objetivo: refatorar o front-end do Sonder Clinic para seguir o plano técnico em PLANO_TECNICO_FRONTEND_SONDER_CLINIC.md e a referência visual sonder-clinic-workspace-v3.html.

Regras obrigatórias:
1. Não presuma a estrutura do projeto. Identifique framework, versão, roteamento, bibliotecas, cliente HTTP, autenticação, permissões, modelos e testes.
2. Crie primeiro docs/frontend-audit.md com o inventário do projeto e o mapa dos contratos de API usados pelo front-end.
3. Execute e registre os resultados atuais de install, lint, typecheck, test e build antes das alterações.
4. Não renomeie endpoints, campos de DTO, métodos HTTP, query keys, parâmetros, cabeçalhos, tokens, cookies ou regras de autenticação sem necessidade comprovada.
5. Preserve as integrações existentes criando mappers/adapters de apresentação quando o novo layout exigir outro formato.
6. Não mova regras de negócio do backend para o front-end.
7. Não substitua bibliotecas existentes apenas por preferência pessoal.
8. Faça a migração incremental por domínio, mantendo o sistema utilizável em cada etapa.
9. Implemente estados de loading, vazio, erro, permissão e sucesso.
10. Respeite as permissões e não envie dados sensíveis desnecessários ao cliente.
11. O prontuário do paciente deve abrir em tela/rota dedicada, sem coluna lateral mostrando outros pacientes.
12. Implemente as abas Resumo, Anamnese, Odontograma, Tratamentos, Evolução, Financeiro e Documentos.
13. Implemente Modo Atendimento para ocultar informações administrativas/financeiras, sem usá-lo como substituto de autorização do backend.
14. Divida Financeiro em Visão geral, Contas a receber, Contas a pagar, Comissões, Recorrências e Fluxo de caixa.
15. Implemente Central de retornos, Tarefas e Central de alertas com badges acionáveis.
16. Implemente Laboratório & casos com suporte a prótese, ortodontia e implantodontia, mantendo histórico de status e prazos.
17. Se um recurso não tiver endpoint no backend, não invente integração de produção. Documente o contrato necessário e deixe o recurso sob feature flag ou somente no ambiente de demonstração.
18. Adicione ou atualize testes unitários, integração, E2E e regressão visual.
19. Ao final de cada fase, execute lint, typecheck, testes e build.
20. Entregue um relatório final com arquivos alterados, decisões, APIs preservadas, pendências e evidências de testes.

Ordem de execução:
- Fase 0: inventário e baseline.
- Fase 1: design system e shell.
- Fase 2: visão diária e agenda.
- Fase 3: pacientes e prontuário.
- Fase 4: financeiro.
- Fase 5: retornos, tarefas e alertas.
- Fase 6: laboratório e casos.
- Fase 7: relatórios, acessibilidade, performance e QA.

Antes de codificar cada fase, apresente uma lista objetiva dos arquivos que serão alterados e o motivo. Não realize reescrita ampla sem necessidade.
```

---

## 27. Referências funcionais estudadas

As referências foram usadas para entender padrões de produto, não para copiar identidade visual ou código proprietário.

- Central de ajuda Codental — gestão de prontuários, documentos, tratamentos, evolução e controle de próteses.
- Central de ajuda Codental — painel financeiro, fluxo de caixa, despesas e comissões.
- Central de ajuda Codental — organização de tarefas e alertas.
- Central de ajuda Simples Dental — alertas de retorno, agenda, débitos e comissões.

Padrões aproveitados:

- ficha clínica organizada por contexto;
- odontograma ligado a tratamentos;
- evolução cronológica;
- financeiro conectado ao paciente;
- tarefas com prazo e responsável;
- retorno como lembrete acionável;
- quadro laboratorial por status;
- geração de alerta quando trabalho retorna sem consulta marcada.

---

## 28. Limites deste documento

Este documento descreve a arquitetura visual, funcional e a estratégia de integração. Ele não confirma que o backend atual já possui endpoints para:

- central de retornos;
- tarefas recorrentes;
- notificações consolidadas;
- casos laboratoriais;
- comissões detalhadas;
- recorrências financeiras;
- modo atendimento;
- relatórios propostos.

Esses recursos devem ser classificados na Fase 0 como:

- já existente e reutilizável;
- parcialmente existente;
- inexistente, exigindo contrato de backend;
- existente com incompatibilidade que pode ser resolvida por adapter.

A implementação só deve começar após essa classificação.
