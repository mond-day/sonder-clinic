# SONDER CLINIC — ESPECIFICAÇÃO TÉCNICA FINAL PARA IMPLEMENTAÇÃO INTEGRAL

**Repositório:** `mond-day/sonder-clinic`  
**Base auditada:** commit `c1d51d3ec9bf43035a5f013b95f9c87f0430b32a`  
**Data da especificação:** 5 de agosto de 2026  
**Referências visuais:** diretório `HTML_REFERENCIAS` deste pacote  
**Regra de execução:** implementar todo o escopo aprovado em uma única execução técnica, sem solicitar aprovações intermediárias por módulo.

---

## 1. Instrução principal para o Cursor

Leia integralmente este arquivo e todos os HTMLs de referência antes de modificar o código.

Execute uma auditoria curta do estado atual da branch para confirmar que o código ainda corresponde à base descrita neste documento. Caso existam commits posteriores, preserve as mudanças válidas e adapte esta especificação ao estado real sem desfazer funcionalidades já implementadas.

Implemente **todo o escopo aprovado**, incluindo:

- front-end Next.js;
- API NestJS;
- schema Prisma;
- migrações;
- seeds;
- permissões RBAC;
- auditoria;
- storage e anexos quando aplicável;
- testes unitários, integração, contrato e E2E;
- documentação técnica;
- tratamento de estados de carregamento, vazio, erro, permissão e indisponibilidade externa.

Não pare para aprovação entre módulos. Divida o trabalho internamente em etapas pequenas, mas prossiga automaticamente até concluir todos os itens. Interrompa somente diante de um bloqueio real que não possa ser resolvido pelo código, como credencial externa obrigatória e ausente.

Os HTMLs são referências de experiência, hierarquia e comportamento. Não copie literalmente o HTML estático para componentes React. Converta cada padrão para os componentes, providers, rotas e contratos reais do sistema.

---

## 2. Estado real do projeto auditado

A base atual já possui:

- monorepo com pnpm e Turborepo;
- Next.js 16 com App Router e React 19;
- NestJS 11;
- Prisma 6 com PostgreSQL;
- autenticação JWT e refresh token em cookie HttpOnly;
- RBAC por `Permission`, `Role`, `RolePermission` e `UserRole`;
- contexto de organização, clínica, unidade, cadeira e profissional;
- pacientes, responsáveis, agenda, etiquetas e lembretes;
- prontuário clínico;
- evolução clínica com rascunho, assinatura, hash e correção por adendo;
- templates e respostas de anamnese;
- odontograma;
- procedimentos e planos de tratamento;
- documentos, assinaturas e validação;
- recebíveis, pagamentos, estornos e regras de comissão;
- central de retornos, tarefas, casos laboratoriais e notificações;
- integrações criptografadas;
- relatório resumido;
- upload de certificado A1 com armazenamento privado local em desenvolvimento.

### 2.1 Contratos atuais que devem ser preservados

Não renomear ou remover endpoints, campos, enums ou permissões existentes sem necessidade. Evoluir os contratos de forma aditiva e backward-compatible sempre que possível.

Contratos clínicos já existentes:

```http
GET  /api/v1/patients/:id/clinical-record?clinicId=
POST /api/v1/patients/:id/clinical-entries
POST /api/v1/clinical-entries/:id/sign
POST /api/v1/clinical-entries/:id/corrections

GET  /api/v1/anamnesis/templates
POST /api/v1/anamnesis/templates
POST /api/v1/patients/:id/anamnesis
POST /api/v1/anamnesis/:id/sign
```

Modelos atuais relevantes:

- `ClinicalRecord`
- `ClinicalEntry`
- `ClinicalEntryCorrection`
- `AnamnesisTemplate`
- `AnamnesisResponse`
- `PatientAlert`
- `TreatmentPlan`
- `TreatmentItem`
- `TreatmentSession`
- `FileObject`
- `PatientMedia`
- `AuditEvent`

---

## 3. Ordem de precedência das referências HTML

1. `HTML_REFERENCIAS/02_ANAMNESE_EVOLUCAO_V2/anamnese.html`
2. `HTML_REFERENCIAS/02_ANAMNESE_EVOLUCAO_V2/evolucao.html`
3. Todos os arquivos de `HTML_REFERENCIAS/01_WORKSPACE_APROVADO/modulos/`
4. `HTML_REFERENCIAS/01_WORKSPACE_APROVADO/index.html`
5. `HTML_REFERENCIAS/01_WORKSPACE_APROVADO/auditoria.html`

As versões V2 de Anamnese e Evolução substituem visual e funcionalmente os arquivos de mesmo tema do primeiro pacote.

---

# PARTE I — FUNDAÇÃO DE UI E ARQUITETURA

## 4. Princípios visuais obrigatórios

Manter a identidade aprovada:

- sidebar verde-petróleo;
- fundo neutro claro;
- painéis brancos com bordas discretas;
- tipografia limpa e sem aparência de template gerado por IA;
- densidade equilibrada para uso diário;
- hierarquia visual por títulos, subtítulos, badges, painéis e divisores;
- componentes com estados reais;
- modais apenas para fluxos contextuais;
- páginas dedicadas para processos extensos;
- responsividade para desktop, tablet e celular;
- foco principal: recepção em desktop, dentista em desktop/tablet e paciente no celular para formulários e assinaturas.

### 4.1 Não introduzir uma nova biblioteca visual sem justificativa

A base usa CSS global e componentes próprios. Manter esta estratégia nesta implementação.

Criar ou consolidar componentes reutilizáveis:

```text
components/ui/
  Button
  IconButton
  Badge
  Panel
  MetricCard
  EmptyState
  ErrorState
  Skeleton
  Modal
  Drawer
  ConfirmationDialog
  Disclosure
  SearchableSelect
  MultiSearchableSelect
  SegmentedControl
  Tabs
  Timeline
  DataTable
  FilterDrawer
  FormSection
  QuestionRenderer
  SignaturePad
  FileUploader
  AuditHistory
```

### 4.2 Padrão de visualização antes da edição

Detalhes de agenda, tarefas, laboratório, financeiro e demais registros devem abrir em modo somente leitura.

Ações:

- `Editar`;
- `Cancelar edição`;
- `Salvar alterações`;
- ações destrutivas separadas;
- confirmação com contexto;
- motivo obrigatório quando a regra exigir;
- histórico de alterações visível.

### 4.3 Estados obrigatórios em todas as páginas

Cada módulo deve tratar:

- carregamento;
- lista vazia;
- busca sem resultado;
- erro recuperável;
- erro de permissão;
- registro arquivado;
- conflito de versão;
- indisponibilidade de integração externa;
- sucesso de mutação;
- bloqueio por regra de negócio.

---

# PARTE II — AGENDA, PACIENTES E PRONTUÁRIO

## 5. Agenda clínica

Referência: `01_WORKSPACE_APROVADO/modulos/agenda.html`.

### 5.1 Detalhe do agendamento

Ao clicar em um agendamento:

1. abrir modal em visualização;
2. exibir paciente, profissional, procedimento/categoria, unidade, cadeira, status, origem, etiquetas, observações e histórico;
3. oferecer ações:
   - abrir paciente;
   - WhatsApp;
   - confirmar;
   - iniciar atendimento;
   - concluir;
   - marcar falta;
   - reagendar;
   - cancelar;
   - editar;
4. editar somente após ação explícita.

### 5.2 Etiquetas

Substituir checkboxes por `MultiSearchableSelect`.

Requisitos:

- pesquisa;
- múltipla seleção;
- cor;
- criação rápida mediante permissão;
- etiquetas inativas não podem ser adicionadas;
- etiquetas já usadas permanecem visíveis no histórico;
- persistir por `AppointmentTag`.

### 5.3 Cancelamento, falta e reagendamento

Adicionar histórico operacional.

Criar entidades ou eventos auditáveis:

```prisma
model AppointmentStatusEvent {
  id              String            @id @default(uuid()) @db.Uuid
  appointmentId   String            @db.Uuid
  previousStatus  AppointmentStatus?
  nextStatus      AppointmentStatus
  reasonCode      String?
  reasonText      String?
  previousStartAt DateTime?
  nextStartAt     DateTime?
  actorId         String?           @db.Uuid
  createdAt       DateTime          @default(now())
}
```

Regras:

- cancelamento exige motivo;
- falta exige motivo ou classificação;
- reagendamento não apaga o horário anterior;
- conflitos continuam validados no servidor;
- histórico aparece no modal;
- alterações geram `AuditEvent`.

---

## 6. Pacientes

Referência: `01_WORKSPACE_APROVADO/modulos/pacientes.html`.

### 6.1 Menu “Mais ações”

Implementar menu contextual:

- ver detalhes;
- editar cadastro;
- abrir prontuário;
- enviar WhatsApp;
- criar agendamento;
- criar documento;
- criar tarefa;
- criar retorno;
- arquivar;
- excluir somente quando permitido.

### 6.2 Política de exclusão

- paciente com prontuário, tratamento, documento, pagamento, agendamento ou qualquer vínculo: **não excluir**;
- utilizar `ARCHIVED`;
- cadastro vazio criado por engano pode ser excluído por administrador;
- verificar vínculos no backend em transação;
- retornar erro de domínio explicativo;
- registrar auditoria.

### 6.3 Prontuário isolado

Manter rota dedicada:

```text
/pacientes/[patientId]
```

Abas:

- Resumo;
- Anamnese;
- Odontograma;
- Tratamentos;
- Evolução;
- Financeiro;
- Documentos.

Manter `Modo atendimento` ocultando dados administrativos e financeiros sem alterar permissões reais.

---

# PARTE III — ANAMNESE CONFIGURÁVEL

## 7. Objetivo da nova Anamnese

Referência principal: `02_ANAMNESE_EVOLUCAO_V2/anamnese.html`.

A anamnese deve:

- vir pronta com perguntas clínicas iniciais;
- permitir personalização completa por organização;
- possuir quatro modelos iniciais;
- permitir criar outros modelos;
- permitir editar perguntas por interface visual;
- versionar modelos publicados;
- preservar a versão usada em cada resposta;
- suportar rascunho;
- suportar assinatura presencial e remota;
- gerar alertas no prontuário;
- calcular resumo de risco;
- ser utilizável em tablet e celular;
- nunca sobrescrever uma anamnese finalizada.

## 8. Estratégia de persistência

A base já possui `AnamnesisTemplate.schemaJson`. Manter o JSON como representação canônica do formulário, mas nunca expor uma edição de JSON cru ao usuário final.

### 8.1 Evolução do modelo

Adicionar enums:

```prisma
enum AnamnesisTemplateStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum AnamnesisResponseStatus {
  DRAFT
  AWAITING_SIGNATURE
  SIGNED
  EXPIRED
  SUPERSEDED
}

enum AnamnesisSignatureRole {
  PATIENT
  GUARDIAN
  PROFESSIONAL
}

enum SignatureMethod {
  DRAWN
  REMOTE_LINK
  A1
}
```

Evoluir `AnamnesisTemplate`:

```prisma
model AnamnesisTemplate {
  id               String                    @id @default(uuid()) @db.Uuid
  organizationId   String                    @db.Uuid
  name             String
  description      String?
  audience         String
  version          Int                       @default(1)
  status           AnamnesisTemplateStatus   @default(DRAFT)
  schemaJson       Json
  validityMonths   Int                       @default(6)
  isSystemDefault  Boolean                   @default(false)
  sourceTemplateId String?                   @db.Uuid
  createdById      String?                   @db.Uuid
  publishedById    String?                   @db.Uuid
  publishedAt      DateTime?
  archivedAt       DateTime?
  active           Boolean                   @default(true)
  createdAt        DateTime                  @default(now())
  updatedAt        DateTime                  @updatedAt
  responses        AnamnesisResponse[]

  @@unique([organizationId, name, version])
  @@index([organizationId, audience, status])
}
```

Evoluir `AnamnesisResponse`:

```prisma
model AnamnesisResponse {
  id               String                    @id @default(uuid()) @db.Uuid
  organizationId   String                    @db.Uuid
  clinicId         String                    @db.Uuid
  patientId        String                    @db.Uuid
  templateId       String                    @db.Uuid
  templateVersion  Int
  status           AnamnesisResponseStatus   @default(DRAFT)
  answers          Json
  alerts           Json                      @default("[]")
  riskAssessment   Json                      @default("{}")
  completedById    String                    @db.Uuid
  completedAt      DateTime?
  validUntil       DateTime?                 @db.Date
  contentHash      String?
  createdAt        DateTime                  @default(now())
  updatedAt        DateTime                  @updatedAt
  template         AnamnesisTemplate         @relation(fields: [templateId], references: [id])
  signatures       AnamnesisSignature[]

  @@index([organizationId, patientId, createdAt])
}
```

Criar:

```prisma
model AnamnesisSignature {
  id                  String                 @id @default(uuid()) @db.Uuid
  anamnesisResponseId String                 @db.Uuid
  signerId            String?                @db.Uuid
  signerName          String
  signerRole          AnamnesisSignatureRole
  method              SignatureMethod
  evidence            Json                   @default("{}")
  ipAddress           String?
  userAgent           String?
  signedHash          String
  signedAt            DateTime               @default(now())
  response            AnamnesisResponse      @relation(fields: [anamnesisResponseId], references: [id])

  @@index([anamnesisResponseId, signedAt])
}
```

## 9. Schema interno dos modelos configuráveis

Formato sugerido:

```ts
type AnamnesisSchema = {
  schemaVersion: 1;
  title: string;
  audience: 'ADULT' | 'CHILD' | 'ELDERLY' | 'PREGNANT' | 'CUSTOM';
  sections: AnamnesisSection[];
  riskRules: RiskRule[];
  completionRules: CompletionRule[];
};

type AnamnesisSection = {
  id: string;
  code: string;
  title: string;
  description?: string;
  order: number;
  visibleWhen?: ConditionGroup;
  questions: AnamnesisQuestion[];
};

type QuestionType =
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'YES_NO'
  | 'YES_NO_UNKNOWN'
  | 'YES_NO_DETAILS'
  | 'SINGLE_CHOICE'
  | 'SINGLE_CHOICE_DETAILS'
  | 'MULTIPLE_CHOICE'
  | 'MULTIPLE_CHOICE_DETAILS'
  | 'NUMBER'
  | 'NUMBER_UNIT'
  | 'DATE'
  | 'PHONE_CHANNEL'
  | 'SCALE_0_10'
  | 'RISK_LEVEL'
  | 'REPEATER_MEDICATION'
  | 'ACKNOWLEDGEMENT';

type AnamnesisQuestion = {
  id: string;
  code: string;
  label: string;
  helpText?: string;
  type: QuestionType;
  required: boolean;
  order: number;
  options?: Array<{
    value: string;
    label: string;
    color?: string;
  }>;
  defaultValue?: unknown;
  placeholder?: string;
  unit?: string;
  min?: number;
  max?: number;
  visibleWhen?: ConditionGroup;
  details?: {
    enabled: boolean;
    label: string;
    type: 'SHORT_TEXT' | 'LONG_TEXT' | 'REPEATER_MEDICATION';
    requiredWhenVisible?: boolean;
  };
  alertRules?: AlertRule[];
  riskContribution?: RiskContribution[];
};

type ConditionGroup = {
  operator: 'AND' | 'OR';
  conditions: Array<{
    questionCode: string;
    operation:
      | 'EQUALS'
      | 'NOT_EQUALS'
      | 'INCLUDES'
      | 'GREATER_THAN'
      | 'LESS_THAN'
      | 'IS_EMPTY'
      | 'IS_NOT_EMPTY';
    value?: unknown;
  }>;
};

type AlertRule = {
  id: string;
  when: ConditionGroup;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  messageTemplate: string;
  createPatientAlert: boolean;
  blockFinalization?: boolean;
};
```

Validar o schema no backend com Zod antes de salvar ou publicar.

## 10. Editor visual de modelos

Criar em Configurações:

```text
/configuracoes/anamnese
/configuracoes/anamnese/novo
/configuracoes/anamnese/[templateId]
```

Recursos:

- listar modelos por público;
- visualizar rascunho/publicado/arquivado;
- duplicar;
- criar versão;
- editar metadados;
- adicionar seção;
- adicionar pergunta;
- reordenar por drag and drop ou botões acessíveis;
- duplicar pergunta;
- ativar/desativar pergunta;
- tornar obrigatória;
- configurar opções;
- configurar campo de detalhe;
- configurar condição de visibilidade;
- configurar alerta;
- configurar contribuição de risco;
- pré-visualizar em desktop e celular;
- validar antes de publicar;
- publicar;
- arquivar;
- impedir edição de versão publicada;
- criar nova versão a partir da publicada.

### 10.1 Permissões

Adicionar:

```text
anamnesis.template.view
anamnesis.template.create
anamnesis.template.update
anamnesis.template.publish
anamnesis.template.archive
anamnesis.response.view
anamnesis.response.create
anamnesis.response.sign
anamnesis.response.supersede
```

Manter aliases para as permissões atuais durante migração.

## 11. Fluxo do paciente

1. selecionar modelo;
2. criar resposta `DRAFT`;
3. carregar perguntas da versão congelada;
4. autosave com debounce;
5. navegar por seções;
6. calcular progresso;
7. recalcular alertas e risco no servidor;
8. revisar;
9. solicitar assinatura;
10. assinar paciente/responsável;
11. assinar profissional;
12. finalizar e calcular hash;
13. tornar imutável;
14. permitir somente nova versão ou anamnese substituta.

### 11.1 Assinatura remota

Implementar token de uso único:

```prisma
model AnamnesisSignatureRequest {
  id                  String    @id @default(uuid()) @db.Uuid
  anamnesisResponseId String    @db.Uuid
  tokenHash           String    @unique
  signerRole          AnamnesisSignatureRole
  signerName          String
  expiresAt           DateTime
  usedAt              DateTime?
  revokedAt           DateTime?
  createdAt           DateTime  @default(now())
}
```

Página pública protegida por token:

```text
/assinar/anamnese/[token]
```

Requisitos:

- exibir identidade da clínica;
- mostrar conteúdo congelado;
- aceite;
- assinatura desenhada;
- IP e user agent;
- hash;
- expiração;
- revogação;
- não expor outros dados do prontuário.

## 12. Catálogo inicial obrigatório — Adulto

Total: **42 perguntas**.

| Código | Pergunta inicial | Tipo | Obrigatória | Condicional/alerta |
|---|---|---|---:|---|
| `A_ID_01` | Qual é a queixa principal e o motivo da consulta? | `LONG_TEXT` | Sim | — |
| `A_ID_02` | Quando os sintomas ou a necessidade percebida começaram? | `SHORT_TEXT` | Não | — |
| `A_ID_03` | Qual é a intensidade atual do desconforto? | `SCALE_0_10` | Não | Gerar alerta quando ≥ 8 |
| `A_ID_04` | Existe algum fator que piora ou alivia os sintomas? | `LONG_TEXT` | Não | — |
| `A_ID_05` | Qual é a expectativa do paciente em relação ao tratamento? | `LONG_TEXT` | Não | — |
| `A_ID_06` | Possui médico responsável ou acompanhamento médico atual? | `YES_NO_DETAILS` | Não | Exibir nome e contato quando sim |
| `A_MED_01` | Possui hipertensão arterial? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `A_MED_02` | Possui diabetes? | `YES_NO_DETAILS` | Sim | Solicitar tipo, controle e última HbA1c quando sim |
| `A_MED_03` | Possui doença cardíaca, arritmia, histórico de infarto ou cirurgia cardíaca? | `YES_NO_DETAILS` | Sim | Alerta crítico quando sim |
| `A_MED_04` | Possui distúrbio de coagulação, anemia grave ou histórico de sangramento prolongado? | `YES_NO_DETAILS` | Sim | Alerta crítico quando sim |
| `A_MED_05` | Possui doença renal? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `A_MED_06` | Possui doença hepática ou histórico de hepatite? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `A_MED_07` | Possui doença respiratória, asma ou apneia do sono? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `A_MED_08` | Possui epilepsia, convulsões ou condição neurológica? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `A_MED_09` | Possui doença autoimune, câncer ou está em tratamento imunossupressor? | `YES_NO_DETAILS` | Sim | Alerta crítico quando sim |
| `A_MED_10` | Possui doença infecciosa relevante ou condição transmissível em acompanhamento? | `YES_NO_DETAILS` | Sim | Alertar conforme detalhe |
| `A_RX_01` | Utiliza medicamentos continuamente? | `YES_NO_DETAILS` | Sim | Solicitar nome, dose e frequência quando sim |
| `A_RX_02` | Utiliza anticoagulante ou antiagregante plaquetário? | `YES_NO_DETAILS` | Sim | Alerta crítico quando sim |
| `A_RX_03` | Utiliza bisfosfonato, denosumabe ou medicamento relacionado ao metabolismo ósseo? | `YES_NO_DETAILS` | Sim | Alerta crítico para cirurgia/implante |
| `A_RX_04` | Possui alergia a medicamentos? | `YES_NO_DETAILS` | Sim | Criar PatientAlert com substância e reação |
| `A_RX_05` | Possui alergia a anestésicos, látex, metais ou materiais odontológicos? | `YES_NO_DETAILS` | Sim | Criar PatientAlert |
| `A_RX_06` | Já realizou cirurgia, internação ou transfusão relevante? | `YES_NO_DETAILS` | Não | Solicitar data e intercorrências |
| `A_OD_01` | Quando ocorreu a última consulta odontológica? | `SHORT_TEXT` | Não | — |
| `A_OD_02` | Com que frequência costuma realizar consultas odontológicas? | `SINGLE_CHOICE` | Não | Opções configuráveis |
| `A_OD_03` | Já teve experiência negativa ou medo de tratamento odontológico? | `YES_NO_DETAILS` | Não | Gerar alerta de ansiedade quando sim |
| `A_OD_04` | Apresenta sangramento gengival? | `SINGLE_CHOICE` | Não | Nunca/Às vezes/Frequente |
| `A_OD_05` | Apresenta sensibilidade dentária? | `YES_NO_DETAILS` | Não | Solicitar estímulo e região |
| `A_OD_06` | Possui bruxismo ou apertamento? | `SINGLE_CHOICE` | Não | Não/Suspeita/Diagnosticado |
| `A_OD_07` | Já sofreu trauma em dentes, face ou mandíbula? | `YES_NO_DETAILS` | Não | Solicitar data e região |
| `A_OD_08` | Utiliza ou já utilizou prótese, aparelho ortodôntico, implante ou placa? | `MULTIPLE_CHOICE_DETAILS` | Não | Detalhar cada item marcado |
| `A_HAB_01` | Fuma ou utiliza nicotina? | `SINGLE_CHOICE_DETAILS` | Sim | Quantidade e tempo de uso |
| `A_HAB_02` | Consome bebida alcoólica? | `SINGLE_CHOICE_DETAILS` | Não | Frequência configurável |
| `A_HAB_03` | Quantas vezes escova os dentes por dia? | `SINGLE_CHOICE` | Não | — |
| `A_HAB_04` | Com que frequência utiliza fio dental? | `SINGLE_CHOICE` | Não | — |
| `A_HAB_05` | Possui consumo frequente de açúcar, bebidas ácidas ou lanches entre refeições? | `MULTIPLE_CHOICE` | Não | Contribui para risco de cárie |
| `A_HAB_06` | Possui hábito de roer unhas, morder objetos, respirar pela boca ou outro hábito oral? | `MULTIPLE_CHOICE_DETAILS` | Não | — |
| `A_RISK_01` | Classificação de risco médico sistêmico | `RISK_LEVEL` | Sim | Baixo/Moderado/Alto |
| `A_RISK_02` | Classificação de risco de cárie | `RISK_LEVEL` | Sim | Baixo/Moderado/Alto |
| `A_RISK_03` | Classificação de risco periodontal | `RISK_LEVEL` | Sim | Baixo/Moderado/Alto |
| `A_RISK_04` | Classificação de ansiedade odontológica | `RISK_LEVEL` | Sim | Baixa/Moderada/Alta |
| `A_SIG_01` | Declaro que as informações fornecidas são verdadeiras e completas. | `ACKNOWLEDGEMENT` | Sim | Obrigatório para finalizar |
| `A_SIG_02` | Autorizo o uso das informações para planejamento e segurança do atendimento. | `ACKNOWLEDGEMENT` | Sim | Obrigatório para finalizar |

## 13. Catálogo inicial obrigatório — Infantil

Total: **48 perguntas**.

| Código | Pergunta inicial | Tipo | Obrigatória | Condicional/alerta |
|---|---|---|---:|---|
| `C_ID_01` | Nome do responsável principal | `SHORT_TEXT` | Sim | Pré-preencher a partir de PatientGuardian |
| `C_ID_02` | Parentesco do responsável | `SINGLE_CHOICE` | Sim | — |
| `C_ID_03` | O responsável possui autorização legal para assinar documentos? | `YES_NO` | Sim | Bloquear assinatura quando não |
| `C_ID_04` | Telefone e canal preferencial do responsável | `PHONE_CHANNEL` | Sim | — |
| `C_ID_05` | Qual é a queixa principal da criança ou do responsável? | `LONG_TEXT` | Sim | — |
| `C_ID_06` | A criança já foi atendida por dentista anteriormente? | `YES_NO_DETAILS` | Não | Solicitar experiência quando sim |
| `C_ID_07` | Como a criança costuma reagir em ambientes de saúde? | `SINGLE_CHOICE_DETAILS` | Não | Calma/Ansiosa/Resistente/Não sabe |
| `C_BIRTH_01` | A gestação foi considerada de risco? | `YES_NO_DETAILS` | Não | — |
| `C_BIRTH_02` | Houve uso de medicamentos relevantes durante a gestação? | `YES_NO_DETAILS` | Não | — |
| `C_BIRTH_03` | O nascimento foi prematuro? | `YES_NO_DETAILS` | Não | Solicitar idade gestacional |
| `C_BIRTH_04` | Qual foi o tipo de parto? | `SINGLE_CHOICE` | Não | Normal/Cesárea/Outro |
| `C_BIRTH_05` | Peso ao nascer | `NUMBER_UNIT` | Não | kg |
| `C_BIRTH_06` | Houve internação neonatal ou intercorrência no nascimento? | `YES_NO_DETAILS` | Não | — |
| `C_BIRTH_07` | A criança apresenta atraso de desenvolvimento ou acompanhamento especializado? | `YES_NO_DETAILS` | Não | Alertar quando sim |
| `C_MED_01` | Possui doença cardíaca congênita ou adquirida? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `C_MED_02` | Possui asma ou outra doença respiratória? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `C_MED_03` | Possui diabetes ou alteração metabólica? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `C_MED_04` | Possui epilepsia, convulsão ou condição neurológica? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `C_MED_05` | Possui transtorno do neurodesenvolvimento ou necessidade de adaptação do atendimento? | `YES_NO_DETAILS` | Não | Gerar preferência de atendimento |
| `C_MED_06` | Possui distúrbio de coagulação ou sangramento prolongado? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `C_MED_07` | Possui doença renal, hepática ou imunológica? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `C_MED_08` | Está em acompanhamento médico regular? | `YES_NO_DETAILS` | Não | Solicitar profissional e contato |
| `C_RX_01` | Utiliza medicamentos continuamente? | `YES_NO_DETAILS` | Sim | — |
| `C_RX_02` | Possui alergia a medicamentos? | `YES_NO_DETAILS` | Sim | Criar PatientAlert |
| `C_RX_03` | Possui alergia a alimentos, látex, materiais ou anestésicos? | `YES_NO_DETAILS` | Sim | Criar PatientAlert |
| `C_RX_04` | Já realizou cirurgia ou internação relevante? | `YES_NO_DETAILS` | Não | — |
| `C_RX_05` | A carteira de vacinação está atualizada? | `YES_NO_UNKNOWN` | Não | — |
| `C_DEV_01` | Utilizou mamadeira? | `YES_NO_DETAILS` | Não | Solicitar até qual idade |
| `C_DEV_02` | Utilizou chupeta? | `YES_NO_DETAILS` | Não | Solicitar até qual idade |
| `C_DEV_03` | Possui hábito de sucção digital? | `YES_NO_DETAILS` | Não | — |
| `C_DEV_04` | Apresenta respiração bucal? | `YES_NO_UNKNOWN` | Não | Alertar para avaliação |
| `C_DEV_05` | Apresenta ronco ou sono agitado? | `YES_NO_DETAILS` | Não | — |
| `C_DEV_06` | Possui hábito de roer unhas ou morder objetos? | `YES_NO_DETAILS` | Não | — |
| `C_DEV_07` | Como é a alimentação em relação a açúcar e alimentos ultraprocessados? | `SINGLE_CHOICE_DETAILS` | Não | Baixo/Moderado/Alto |
| `C_DEV_08` | A criança aceita escovação com ajuda do responsável? | `SINGLE_CHOICE_DETAILS` | Não | — |
| `C_OD_01` | Quando ocorreu a primeira consulta odontológica? | `SHORT_TEXT` | Não | — |
| `C_OD_02` | Já apresentou cárie ou realizou restauração? | `YES_NO_DETAILS` | Não | — |
| `C_OD_03` | Já sofreu trauma dentário? | `YES_NO_DETAILS` | Não | Solicitar região e data |
| `C_OD_04` | Apresenta dor, sensibilidade ou dificuldade para mastigar? | `MULTIPLE_CHOICE_DETAILS` | Não | — |
| `C_OD_05` | Há sangramento gengival? | `SINGLE_CHOICE` | Não | — |
| `C_OD_06` | Utiliza aparelho, mantenedor ou outro dispositivo? | `YES_NO_DETAILS` | Não | — |
| `C_OD_07` | Recebe aplicação de flúor ou acompanhamento preventivo regular? | `YES_NO_DETAILS` | Não | — |
| `C_RISK_01` | Classificação de risco médico pediátrico | `RISK_LEVEL` | Sim | — |
| `C_RISK_02` | Classificação de risco de cárie | `RISK_LEVEL` | Sim | — |
| `C_RISK_03` | Nível de ansiedade/comportamento esperado | `RISK_LEVEL` | Sim | — |
| `C_RISK_04` | Necessidade de adaptação, sedação ou atendimento especializado | `YES_NO_DETAILS` | Não | Alerta operacional |
| `C_SIG_01` | O responsável declara que as informações são verdadeiras e completas. | `ACKNOWLEDGEMENT` | Sim | — |
| `C_SIG_02` | O responsável autoriza o uso das informações para o atendimento da criança. | `ACKNOWLEDGEMENT` | Sim | — |

## 14. Catálogo inicial obrigatório — Idoso

Total: **45 perguntas**.

| Código | Pergunta inicial | Tipo | Obrigatória | Condicional/alerta |
|---|---|---|---:|---|
| `E_ID_01` | Qual é a queixa principal e o objetivo do atendimento? | `LONG_TEXT` | Sim | — |
| `E_ID_02` | Possui cuidador ou acompanhante principal? | `YES_NO_DETAILS` | Não | Vincular contato quando sim |
| `E_ID_03` | Quem auxilia nas decisões de saúde? | `SHORT_TEXT` | Não | — |
| `E_ID_04` | Possui diretiva, procuração ou limitação legal relevante? | `YES_NO_DETAILS` | Não | — |
| `E_ID_05` | Mora sozinho, com família ou em instituição? | `SINGLE_CHOICE_DETAILS` | Não | — |
| `E_ID_06` | Possui dificuldade de locomoção para comparecer à clínica? | `YES_NO_DETAILS` | Não | Criar preferência operacional |
| `E_AUT_01` | Consegue realizar higiene oral sem ajuda? | `SINGLE_CHOICE_DETAILS` | Sim | Independente/Parcial/Dependente |
| `E_AUT_02` | Possui dificuldade visual ou auditiva? | `MULTIPLE_CHOICE_DETAILS` | Não | — |
| `E_AUT_03` | Possui diagnóstico de demência, comprometimento cognitivo ou confusão frequente? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `E_AUT_04` | Consegue compreender e consentir com o tratamento? | `YES_NO_UNKNOWN` | Sim | Definir responsável quando não |
| `E_AUT_05` | Possui histórico recente de quedas? | `YES_NO_DETAILS` | Não | — |
| `E_AUT_06` | Necessita adaptação de cadeira, tempo de consulta ou acompanhante? | `MULTIPLE_CHOICE_DETAILS` | Não | Preferência operacional |
| `E_MED_01` | Possui hipertensão arterial? | `YES_NO_DETAILS` | Sim | — |
| `E_MED_02` | Possui diabetes? | `YES_NO_DETAILS` | Sim | — |
| `E_MED_03` | Possui insuficiência cardíaca, arritmia ou histórico de infarto? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `E_MED_04` | Possui histórico de AVC ou doença neurológica? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `E_MED_05` | Possui doença renal? | `YES_NO_DETAILS` | Sim | — |
| `E_MED_06` | Possui doença hepática? | `YES_NO_DETAILS` | Sim | — |
| `E_MED_07` | Possui osteoporose ou já teve fratura por fragilidade? | `YES_NO_DETAILS` | Sim | — |
| `E_MED_08` | Realiza hemodiálise, quimioterapia, radioterapia ou tratamento imunossupressor? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `E_MED_09` | Possui doença respiratória ou utiliza oxigênio? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `E_RX_01` | Quantos medicamentos utiliza diariamente? | `NUMBER` | Sim | Polifarmácia quando ≥ 5 |
| `E_RX_02` | Liste medicamentos, doses e horários | `REPEATER_MEDICATION` | Sim | — |
| `E_RX_03` | Utiliza anticoagulante ou antiagregante? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `E_RX_04` | Utiliza bisfosfonato, denosumabe ou medicamento ósseo? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `E_RX_05` | Possui alergia a medicamentos ou materiais? | `YES_NO_DETAILS` | Sim | Criar PatientAlert |
| `E_RX_06` | Teve reação adversa ou interação medicamentosa conhecida? | `YES_NO_DETAILS` | Não | — |
| `E_OD_01` | Utiliza prótese total, parcial, fixa ou implante? | `MULTIPLE_CHOICE_DETAILS` | Não | — |
| `E_OD_02` | A prótese causa dor, ferida, instabilidade ou dificuldade para mastigar? | `MULTIPLE_CHOICE_DETAILS` | Não | — |
| `E_OD_03` | Quando foi realizada a última manutenção da prótese? | `SHORT_TEXT` | Não | — |
| `E_OD_04` | Apresenta boca seca? | `SINGLE_CHOICE_DETAILS` | Não | Nunca/Às vezes/Frequente |
| `E_OD_05` | Apresenta dificuldade para engolir? | `YES_NO_DETAILS` | Não | Alertar quando sim |
| `E_OD_06` | Apresenta ferida, mancha ou alteração de mucosa persistente? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `E_OD_07` | Possui dor, mobilidade dentária ou sangramento gengival? | `MULTIPLE_CHOICE_DETAILS` | Não | — |
| `E_HAB_01` | Como está o apetite e a alimentação? | `SINGLE_CHOICE_DETAILS` | Não | — |
| `E_HAB_02` | Possui perda de peso recente sem intenção? | `YES_NO_DETAILS` | Não | Alertar quando sim |
| `E_HAB_03` | Fuma ou fumou por período prolongado? | `SINGLE_CHOICE_DETAILS` | Sim | — |
| `E_HAB_04` | Consome álcool? | `SINGLE_CHOICE_DETAILS` | Não | — |
| `E_HAB_05` | Qual é a rotina de higiene oral e limpeza das próteses? | `LONG_TEXT` | Não | — |
| `E_RISK_01` | Classificação de risco médico sistêmico | `RISK_LEVEL` | Sim | — |
| `E_RISK_02` | Classificação de risco de queda e mobilidade | `RISK_LEVEL` | Sim | — |
| `E_RISK_03` | Classificação de autonomia para autocuidado | `RISK_LEVEL` | Sim | — |
| `E_RISK_04` | Classificação de risco de lesão oral/câncer bucal | `RISK_LEVEL` | Sim | — |
| `E_SIG_01` | Paciente ou responsável declara que as informações são verdadeiras. | `ACKNOWLEDGEMENT` | Sim | — |
| `E_SIG_02` | Paciente ou responsável autoriza o uso clínico das informações. | `ACKNOWLEDGEMENT` | Sim | — |

## 15. Catálogo inicial obrigatório — Gestante

Total: **38 perguntas**.

| Código | Pergunta inicial | Tipo | Obrigatória | Condicional/alerta |
|---|---|---|---:|---|
| `P_GES_01` | Qual é a idade gestacional atual? | `NUMBER_UNIT` | Sim | Semanas |
| `P_GES_02` | Qual é a data provável do parto? | `DATE` | Sim | — |
| `P_GES_03` | Qual é o nome e contato do obstetra? | `SHORT_TEXT` | Não | — |
| `P_GES_04` | A gestação é considerada de risco? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `P_GES_05` | É gestação única ou múltipla? | `SINGLE_CHOICE` | Não | — |
| `P_GES_06` | Já ocorreu perda gestacional ou parto prematuro anterior? | `YES_NO_DETAILS` | Não | — |
| `P_OBS_01` | Possui hipertensão gestacional ou pré-eclâmpsia? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `P_OBS_02` | Possui diabetes gestacional? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `P_OBS_03` | Apresenta sangramento, contrações ou recomendação de repouso? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `P_OBS_04` | Possui náuseas ou vômitos frequentes? | `YES_NO_DETAILS` | Não | Contribui para risco erosivo |
| `P_OBS_05` | O obstetra impôs alguma restrição a procedimentos ou medicamentos? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `P_OBS_06` | Há indicação de profilaxia antibiótica ou cuidado especial documentado? | `YES_NO_DETAILS` | Não | — |
| `P_MED_01` | Possui doença cardíaca, renal, hepática ou respiratória? | `MULTIPLE_CHOICE_DETAILS` | Sim | Alerta por item |
| `P_MED_02` | Possui distúrbio de coagulação ou anemia importante? | `YES_NO_DETAILS` | Sim | Alertar quando sim |
| `P_MED_03` | Possui epilepsia, condição neurológica ou autoimune? | `YES_NO_DETAILS` | Sim | — |
| `P_MED_04` | Teve infecção relevante durante a gestação? | `YES_NO_DETAILS` | Não | — |
| `P_MED_05` | Está em acompanhamento médico além do pré-natal? | `YES_NO_DETAILS` | Não | — |
| `P_MED_06` | Realizou internação durante a gestação atual? | `YES_NO_DETAILS` | Não | — |
| `P_RX_01` | Quais medicamentos e suplementos utiliza atualmente? | `REPEATER_MEDICATION` | Sim | — |
| `P_RX_02` | Utiliza anticoagulante ou medicamento de alto risco? | `YES_NO_DETAILS` | Sim | Alerta crítico |
| `P_RX_03` | Possui alergia a medicamentos? | `YES_NO_DETAILS` | Sim | Criar PatientAlert |
| `P_RX_04` | Possui alergia a anestésicos, látex ou materiais? | `YES_NO_DETAILS` | Sim | Criar PatientAlert |
| `P_RX_05` | Utilizou medicamento sem prescrição durante a gestação? | `YES_NO_DETAILS` | Não | — |
| `P_OD_01` | Apresenta sangramento gengival ou aumento gengival? | `YES_NO_DETAILS` | Não | — |
| `P_OD_02` | Apresenta dor de dente ou infecção ativa? | `YES_NO_DETAILS` | Sim | Alerta de prioridade |
| `P_OD_03` | Apresenta sensibilidade, erosão ou desgaste associado a vômitos? | `YES_NO_DETAILS` | Não | — |
| `P_OD_04` | Possui dente quebrado, mobilidade ou dificuldade para mastigar? | `MULTIPLE_CHOICE_DETAILS` | Não | — |
| `P_OD_05` | Quando ocorreu a última consulta odontológica? | `SHORT_TEXT` | Não | — |
| `P_RISK_01` | Frequência de escovação | `SINGLE_CHOICE` | Não | — |
| `P_RISK_02` | Frequência de fio dental | `SINGLE_CHOICE` | Não | — |
| `P_RISK_03` | Consumo de açúcar entre refeições | `SINGLE_CHOICE` | Não | — |
| `P_RISK_04` | Frequência de vômitos ou refluxo | `SINGLE_CHOICE_DETAILS` | Não | — |
| `P_RISK_05` | Classificação de risco médico-obstétrico | `RISK_LEVEL` | Sim | — |
| `P_RISK_06` | Classificação de risco de cárie/erosão | `RISK_LEVEL` | Sim | — |
| `P_RISK_07` | Necessita autorização ou contato com obstetra antes do procedimento? | `YES_NO_DETAILS` | Sim | Bloquear finalização do plano quando necessário |
| `P_RISK_08` | Condutas e restrições clínicas registradas pelo profissional | `LONG_TEXT` | Sim | — |
| `P_SIG_01` | Declaro que as informações fornecidas sobre a gestação são verdadeiras. | `ACKNOWLEDGEMENT` | Sim | — |
| `P_SIG_02` | Autorizo o uso das informações para planejamento seguro do atendimento. | `ACKNOWLEDGEMENT` | Sim | — |

## 16. Seed dos modelos

Criar seed idempotente:

```text
packages/database/prisma/seeds/anamnesis/
  adult-v1.ts
  child-v1.ts
  elderly-v1.ts
  pregnant-v1.ts
  index.ts
```

Regras:

- utilizar IDs determinísticos;
- `isSystemDefault = true`;
- status `PUBLISHED`;
- não sobrescrever personalizações;
- criar somente quando a versão padrão não existir;
- modelos padrão podem ser duplicados;
- edição gera nova versão;
- registrar quantidade e hash do schema no log do seed.

## 17. APIs de anamnese

Manter as atuais e adicionar:

```http
GET    /api/v1/anamnesis/templates?audience=&status=&includeArchived=
GET    /api/v1/anamnesis/templates/:id
POST   /api/v1/anamnesis/templates
PATCH  /api/v1/anamnesis/templates/:id
POST   /api/v1/anamnesis/templates/:id/duplicate
POST   /api/v1/anamnesis/templates/:id/publish
POST   /api/v1/anamnesis/templates/:id/archive
POST   /api/v1/anamnesis/templates/:id/new-version
POST   /api/v1/anamnesis/templates/:id/validate

GET    /api/v1/patients/:id/anamnesis?clinicId=
GET    /api/v1/anamnesis/:id
POST   /api/v1/patients/:id/anamnesis
PATCH  /api/v1/anamnesis/:id/draft
POST   /api/v1/anamnesis/:id/recalculate
POST   /api/v1/anamnesis/:id/request-signature
POST   /api/v1/anamnesis/:id/sign
POST   /api/v1/anamnesis/:id/supersede

GET    /api/v1/public/anamnesis-signatures/:token
POST   /api/v1/public/anamnesis-signatures/:token/sign
```

### 17.1 Validação das respostas

Nunca aceitar respostas cegamente.

O servidor deve:

- resolver a versão do template;
- validar tipos;
- validar obrigatoriedade;
- validar condições;
- remover respostas de perguntas invisíveis quando configurado;
- calcular alertas;
- calcular risco;
- impedir finalização incompleta;
- gerar hash somente após congelar o conteúdo.

---

# PARTE IV — ODONTOGRAMA E TRATAMENTO

## 18. Odontograma 2D

Referência: `01_WORKSPACE_APROVADO/modulos/odontograma.html`.

Implementar:

- permanente, decídua e mista;
- cinco faces por dente;
- seleção múltipla;
- condição atual, planejada, em execução e concluída;
- histórico por dente e face;
- painel lateral compacto;
- vínculo com plano, item e evolução;
- imagens relacionadas;
- versão imutável por salvamento.

Não implementar 3D funcional nesta entrega. Manter apenas documentação/conceito futuro.

## 19. Plano de tratamento

Referência: `01_WORKSPACE_APROVADO/modulos/plano-tratamento.html`.

Etapas:

1. dados;
2. procedimentos;
3. negociação;
4. aprovação.

Requisitos:

- aprovação parcial;
- seleção de itens;
- assinatura presencial ou remota;
- escolha entre gerar recebíveis ou aprovar sem gerar;
- snapshot de preços;
- histórico de alterações;
- regra transacional para geração de recebíveis;
- não duplicar títulos em reprocessamento;
- idempotency key.

---

# PARTE V — EVOLUÇÃO CLÍNICA

## 20. Objetivo

Referência principal: `02_ANAMNESE_EVOLUCAO_V2/evolucao.html`.

A evolução deve unir:

- histórico selecionável;
- visualização detalhada;
- filtros;
- vínculo com agenda, plano, item, sessão, dente e região;
- campos estruturados;
- anexos;
- rascunho;
- assinatura;
- imutabilidade;
- adendo;
- auditoria.

## 21. Evolução do schema

O modelo atual já suporta `structuredData`, `renderedText`, assinatura, hash e correção. Evoluir de forma aditiva:

```prisma
enum ClinicalCorrectionKind {
  ADDENDUM
  CORRECTION
}

model ClinicalEntry {
  id                 String              @id @default(uuid()) @db.Uuid
  clinicalRecordId   String              @db.Uuid
  professionalId     String              @db.Uuid
  appointmentId      String?             @db.Uuid
  treatmentId        String?             @db.Uuid
  treatmentItemId    String?             @db.Uuid
  treatmentSessionId String?             @db.Uuid
  toothFdi           String?
  region             String?
  type               String
  structuredData     Json                @default("{}")
  renderedText       String
  clinicalDate       DateTime
  status             ClinicalEntryStatus @default(DRAFT)
  signedAt           DateTime?
  contentHash        String?
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt
  record             ClinicalRecord      @relation(fields: [clinicalRecordId], references: [id])
  corrections        ClinicalEntryCorrection[]
  attachments        ClinicalEntryAttachment[]

  @@index([clinicalRecordId, clinicalDate])
  @@index([treatmentItemId, clinicalDate])
  @@index([appointmentId])
}

model ClinicalEntryCorrection {
  id               String                 @id @default(uuid()) @db.Uuid
  clinicalEntryId  String                 @db.Uuid
  authorId         String                 @db.Uuid
  kind             ClinicalCorrectionKind @default(ADDENDUM)
  reason           String
  renderedText     String?
  correctedContent Json
  signatureHash    String?
  createdAt        DateTime               @default(now())
  entry            ClinicalEntry          @relation(fields: [clinicalEntryId], references: [id])
}

model ClinicalEntryAttachment {
  id              String        @id @default(uuid()) @db.Uuid
  clinicalEntryId String        @db.Uuid
  patientMediaId  String        @db.Uuid
  label           String?
  createdAt       DateTime      @default(now())
  entry           ClinicalEntry @relation(fields: [clinicalEntryId], references: [id])

  @@unique([clinicalEntryId, patientMediaId])
}
```

## 22. Estrutura do `structuredData`

```ts
type ClinicalEntryStructuredData = {
  schemaVersion: 1;
  recordType:
    | 'GENERAL_EVOLUTION'
    | 'PROCEDURE'
    | 'ASSESSMENT'
    | 'REMOTE_CONTACT'
    | 'COMPLICATION'
    | 'POST_OPERATIVE';
  procedures: Array<{
    procedureId?: string;
    treatmentItemId?: string;
    toothFdi?: string;
    region?: string;
    description: string;
    materials: Array<{
      name: string;
      brand?: string;
      lot?: string;
      quantity?: string;
    }>;
  }>;
  anesthetic?: {
    product?: string;
    concentration?: string;
    vasoconstrictor?: string;
    quantity?: string;
    lot?: string;
  };
  complications?: Array<{
    type: string;
    description: string;
    conduct: string;
  }>;
  orientations?: string;
  nextConduct?: string;
  suggestedReturnAt?: string;
  vitalSigns?: {
    bloodPressure?: string;
    heartRate?: number;
    glucose?: number;
  };
};
```

## 23. Fluxo visual

### 23.1 Histórico

Coluna lateral:

- pesquisa;
- tipo;
- profissional;
- período;
- plano;
- dente;
- status;
- itens cronológicos.

Detalhe:

- título;
- profissional;
- data clínica;
- status;
- plano;
- procedimento;
- dente/região;
- sessão;
- texto;
- dados estruturados;
- anexos;
- assinatura;
- auditoria;
- adendos.

### 23.2 Nova evolução

Etapas:

1. vínculos;
2. registro clínico;
3. complementos;
4. revisão e assinatura.

Obrigatórios:

- profissional;
- data clínica;
- tipo;
- descrição.

Vínculos opcionais, mas exigidos quando o contexto existir:

- agendamento;
- tratamento;
- item;
- sessão;
- dente/região.

### 23.3 Modelos iniciais

Disponibilizar snippets configuráveis:

- evolução geral;
- endodontia;
- cirurgia;
- ortodontia;
- implantodontia;
- prótese;
- dentística;
- periodontia;
- atendimento infantil;
- contato remoto;
- acompanhamento pós-operatório;
- intercorrência.

Os snippets apenas preenchem a estrutura. O profissional deve revisar.

## 24. Assinatura e adendo

- somente `DRAFT` pode ser editado;
- assinar calcula hash;
- assinado não pode ser alterado;
- correção ou informação posterior cria adendo;
- adendo possui autor, data, motivo e hash;
- exibir registro original e adendos;
- não substituir o texto original;
- toda ação gera auditoria.

## 25. APIs da evolução

Manter as atuais e adicionar filtros/detalhes:

```http
GET    /api/v1/patients/:id/clinical-entries?clinicId=&type=&status=&professionalId=&from=&to=&treatmentId=&toothFdi=
GET    /api/v1/clinical-entries/:id
POST   /api/v1/patients/:id/clinical-entries
PATCH  /api/v1/clinical-entries/:id/draft
POST   /api/v1/clinical-entries/:id/attachments
DELETE /api/v1/clinical-entries/:id/attachments/:attachmentId
POST   /api/v1/clinical-entries/:id/sign
POST   /api/v1/clinical-entries/:id/corrections
```

---

# PARTE VI — DOCUMENTOS

## 26. Biblioteca de documentos

Referência: `01_WORKSPACE_APROVADO/modulos/documentos.html`.

Modelos iniciais:

1. Receita simples;
2. Receita de controle especial;
3. Atestado odontológico;
4. Declaração de comparecimento;
5. Encaminhamento;
6. Consentimento para procedimento;
7. Autorização de uso de imagem;
8. Recusa de tratamento;
9. Contrato de prestação de serviço;
10. Solicitação de exame;
11. Relatório clínico.

Recursos:

- editor de modelos;
- variáveis permitidas;
- prévia;
- rascunho;
- PDF;
- impressão;
- download;
- envio;
- assinatura desenhada;
- assinatura remota;
- A1 quando validado;
- histórico;
- cancelamento com motivo;
- validação pública.

---

# PARTE VII — TAREFAS E ALERTAS

## 27. Tarefas

Referência: `01_WORKSPACE_APROVADO/modulos/tarefas.html`.

Adicionar:

- visualização antes da edição;
- checklist;
- participantes;
- comentários;
- anexos;
- histórico;
- recorrência diária, semanal, mensal e anual;
- conclusão de recorrência gera próxima ocorrência;
- vínculo com paciente, financeiro, agenda e laboratório;
- filtros;
- notificações.

### 27.1 Novos modelos

```prisma
model TaskChecklistItem {
  id            String   @id @default(uuid()) @db.Uuid
  taskId        String   @db.Uuid
  title         String
  completed     Boolean  @default(false)
  sortOrder     Int
  completedById String?  @db.Uuid
  completedAt   DateTime?
}

model TaskParticipant {
  taskId String @db.Uuid
  userId String @db.Uuid
  @@id([taskId, userId])
}

model TaskComment {
  id        String   @id @default(uuid()) @db.Uuid
  taskId    String   @db.Uuid
  authorId  String   @db.Uuid
  content   String
  createdAt DateTime @default(now())
  editedAt  DateTime?
}

model TaskAttachment {
  id          String   @id @default(uuid()) @db.Uuid
  taskId      String   @db.Uuid
  fileId      String   @db.Uuid
  createdById String   @db.Uuid
  createdAt   DateTime @default(now())
}

model TaskRecurrence {
  id             String   @id @default(uuid()) @db.Uuid
  taskId         String   @unique @db.Uuid
  frequency      String
  interval       Int      @default(1)
  endsAt         DateTime?
  nextOccurrence DateTime?
  active         Boolean  @default(true)
}
```

---

# PARTE VIII — LABORATÓRIOS

## 28. Laboratórios e casos

Referência: `01_WORKSPACE_APROVADO/modulos/laboratorios.html`.

Preservar macrostatus:

- `REQUESTED`;
- `IN_LAB`;
- `RETURNED`;
- `INSTALLED`;
- `CANCELLED`.

Adicionar estágio detalhado:

1. solicitação criada;
2. enviado ao laboratório;
3. recebido pelo laboratório;
4. em produção;
5. enviado para a clínica;
6. recebido;
7. em prova;
8. ajuste solicitado;
9. finalizado;
10. entregue/instalado.

Criar cadastro de laboratórios:

```prisma
model Laboratory {
  id              String       @id @default(uuid()) @db.Uuid
  organizationId  String       @db.Uuid
  clinicId        String?      @db.Uuid
  name            String
  taxId           String?
  phone           String?
  email           String?
  addressJson     Json         @default("{}")
  specialties     Json         @default("[]")
  defaultLeadDays Int?
  pricingJson     Json         @default("{}")
  notes           String?
  status          EntityStatus @default(ACTIVE)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}

model LabCaseStageEvent {
  id           String   @id @default(uuid()) @db.Uuid
  labCaseId    String   @db.Uuid
  stage        String
  notes        String?
  trackingCode String?
  actorId      String?  @db.Uuid
  occurredAt   DateTime @default(now())
  metadata     Json     @default("{}")
}
```

Adicionar anexos STL, fotos e documentos usando `FileObject`.

---

# PARTE IX — FINANCEIRO

## 29. Financeiro completo

Referência: `01_WORKSPACE_APROVADO/modulos/financeiro.html`.

Implementar:

- visão geral;
- contas a receber;
- contas a pagar;
- comissões;
- recorrências;
- fluxo de caixa;
- categorias;
- centros de custo;
- conciliação;
- renegociação;
- cancelamento;
- estorno;
- auditoria.

### 29.1 Política de exclusão

- título sem pagamento e sem vínculo: exclusão permitida por permissão;
- título ligado a tratamento aprovado: cancelar, não excluir;
- pagamento parcial: renegociar ou cancelar saldo;
- pagamento confirmado: estornar;
- conciliado: não excluir;
- documento fiscal: fluxo específico;
- tudo auditado.

### 29.2 Comissões

Regra configurável:

- produção;
- recebimento;
- valor fixo.

Criar eventos e competências:

```prisma
model CommissionPeriod {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @db.Uuid
  clinicId       String   @db.Uuid
  referenceMonth DateTime @db.Date
  status         String
  closedAt       DateTime?
  closedById     String?  @db.Uuid
}

model CommissionEvent {
  id               String           @id @default(uuid()) @db.Uuid
  organizationId   String           @db.Uuid
  clinicId         String           @db.Uuid
  professionalId   String           @db.Uuid
  ruleId           String           @db.Uuid
  periodId         String?          @db.Uuid
  sourceType       String
  sourceId         String
  basisAmount      Decimal          @db.Decimal(12,2)
  commissionAmount Decimal          @db.Decimal(12,2)
  status           CommissionStatus
  occurredAt       DateTime
  metadata         Json             @default("{}")
}
```

### 29.3 APIs novas

```http
GET/POST/PATCH /api/v1/payables
POST /api/v1/payables/:id/payments
POST /api/v1/payables/:id/cancel

GET/POST/PATCH /api/v1/finance-recurrences
POST /api/v1/finance-recurrences/:id/generate

GET /api/v1/cashflow?clinicId&from&to&mode=
GET/POST /api/v1/finance-categories
GET/POST /api/v1/cost-centers

GET /api/v1/commission-events
GET/POST /api/v1/commission-periods
POST /api/v1/commission-periods/:id/close
POST /api/v1/commission-periods/:id/reopen
```

---

# PARTE X — RELATÓRIOS

## 30. Catálogo obrigatório

Referência: `01_WORKSPACE_APROVADO/modulos/relatorios.html`.

Implementar os 15 relatórios:

1. Agendamentos;
2. Faltas e cancelamentos;
3. Novos pacientes;
4. Produção por profissional;
5. Produção por procedimento;
6. Planos de tratamento;
7. Conversão de orçamentos;
8. Contas a receber;
9. Inadimplência;
10. Receitas;
11. Despesas;
12. Fluxo de caixa;
13. Laboratórios;
14. Documentos;
15. Evoluções clínicas.

Períodos rápidos:

- hoje;
- ontem;
- esta semana;
- este mês;
- 30 dias;
- 90 dias;
- ano;
- personalizado.

Exportações:

- XLSX;
- CSV;
- PDF;
- impressão.

Requisitos:

- filtros específicos por relatório;
- comparação com período anterior;
- atualização registrada;
- paginação;
- consultas eficientes;
- índices;
- exportação assíncrona apenas se necessário;
- escopo por organização/clínica;
- RBAC.

---

# PARTE XI — USUÁRIOS E PERMISSÕES

## 31. CRUD de usuários e perfis

Referência: `01_WORKSPACE_APROVADO/modulos/usuarios-permissoes.html`.

Implementar:

- usuários;
- convites;
- ativação;
- bloqueio;
- redefinição de acesso;
- perfis;
- permissões;
- vínculo com clínicas;
- matriz de permissões;
- auditoria.

Endpoints:

```http
GET/POST /api/v1/users
GET/PATCH /api/v1/users/:id
POST /api/v1/users/invitations
POST /api/v1/users/:id/block
POST /api/v1/users/:id/activate

GET/POST /api/v1/roles
GET/PATCH /api/v1/roles/:id
POST /api/v1/users/:id/roles
DELETE /api/v1/users/:id/roles/:roleId
```

Não armazenar senha de convite em texto. Usar token hash e expiração.

---

# PARTE XII — CONFIGURAÇÕES

## 32. Organização

Referência: `01_WORKSPACE_APROVADO/modulos/configuracoes.html`.

Categorias:

- clínica;
- usuários;
- profissionais;
- agenda;
- procedimentos;
- anamnese;
- documentos;
- financeiro;
- laboratórios;
- notificações;
- integrações;
- segurança;
- aparência.

Cada cartão deve indicar:

- configurado;
- incompleto;
- erro;
- permissão necessária.

## 33. Integrações externas

Não simular sucesso.

Para credenciais ausentes:

- exibir estado desativado;
- explicar o requisito;
- permitir configurar;
- testar conexão;
- registrar falha segura;
- nunca mostrar segredo em leitura.

---

# PARTE XIII — SEGURANÇA, LGPD E AUDITORIA

## 34. Requisitos

- escopo por `organizationId`;
- escopo por clínica;
- checagem de permissão no backend;
- não confiar em controles visuais;
- dados clínicos sensíveis sem logs;
- anexos privados;
- URLs assinadas de curta duração;
- content hash em registros assinados;
- auditoria de criação, edição, assinatura, cancelamento, arquivamento, estorno e mudança de permissão;
- IP e user agent para assinaturas remotas;
- retenção;
- soft delete quando necessário;
- mascaramento em listas.

---

# PARTE XIV — TESTES

## 35. Testes unitários

Cobrir:

- validação do schema de anamnese;
- condições;
- alertas;
- risco;
- publicação de template;
- imutabilidade;
- autosave;
- assinatura;
- hash;
- adendo;
- cancelamento de agenda;
- exclusão de paciente;
- aprovação parcial;
- geração idempotente de recebíveis;
- comissão;
- recorrência;
- fluxo laboratorial.

## 36. Testes de integração/API

Cenários obrigatórios:

### Anamnese

- criar template em rascunho;
- editar;
- validar;
- publicar;
- tentar editar publicado e receber conflito;
- criar nova versão;
- criar resposta;
- autosave;
- validar perguntas condicionais;
- gerar alerta;
- assinar paciente;
- assinar profissional;
- bloquear edição após assinatura;
- supersede por nova anamnese.

### Evolução

- criar rascunho;
- atualizar rascunho;
- anexar arquivo;
- assinar;
- verificar hash;
- bloquear alteração;
- criar adendo;
- listar com filtros.

### Financeiro

- aprovação de plano com e sem geração;
- idempotência;
- pagamento parcial;
- renegociação;
- estorno;
- bloqueio de exclusão.

## 37. E2E

Usar Playwright.

Fluxos:

1. recepção pesquisa paciente e abre menu;
2. agenda abre detalhe em leitura e edita;
3. dentista preenche anamnese adulta;
4. administrador personaliza pergunta e publica nova versão;
5. paciente assina por link;
6. dentista cria evolução e assina;
7. dentista adiciona adendo;
8. cria plano com aprovação parcial;
9. gera recebíveis;
10. tarefa com checklist e recorrência;
11. caso laboratorial percorre etapas;
12. relatório exporta XLSX/CSV/PDF.

## 38. Qualidade final

Executar:

```bash
pnpm typecheck
pnpm test
env -u NODE_ENV pnpm build
pnpm db:deploy
pnpm db:seed
```

Adicionar testes de migração quando aplicável.

---

# PARTE XV — SEQUÊNCIA DE IMPLEMENTAÇÃO SEM PAUSAS

## 39. Ordem técnica recomendada

1. atualizar branch e registrar baseline;
2. criar migrações aditivas;
3. atualizar Prisma Client;
4. implementar serviços de domínio;
5. implementar DTOs e endpoints;
6. atualizar RBAC e seed;
7. criar componentes de UI comuns;
8. implementar editor de anamnese;
9. implementar preenchimento e assinatura;
10. implementar evolução clínica V2;
11. agenda e pacientes;
12. odontograma e tratamento;
13. documentos;
14. tarefas;
15. laboratórios;
16. financeiro;
17. relatórios;
18. usuários/permissões;
19. configurações;
20. testes;
21. typecheck/build;
22. atualizar documentação.

O Cursor pode criar commits locais por bloco, mas não deve parar para pedir aprovação.

---

# PARTE XVI — CRITÉRIOS DE ACEITE

## 40. Anamnese

- quatro modelos iniciais existem;
- quantidades mínimas de perguntas correspondem a esta especificação;
- editor visual funciona;
- pergunta pode ser criada, editada, duplicada, reordenada e condicionada;
- publicado é imutável;
- nova versão preserva histórico;
- rascunho salva;
- assinatura presencial e remota;
- alertas aparecem no prontuário;
- risco calculado;
- finalizado não é sobrescrito.

## 41. Evolução

- histórico selecionável;
- filtros;
- detalhe completo;
- vínculo com procedimento/dente/sessão;
- anexos;
- rascunho;
- assinatura;
- hash;
- adendo;
- auditoria;
- registro assinado imutável.

## 42. Demais módulos

Todos devem corresponder aos HTMLs aprovados, sem placeholders de produção para recursos que fazem parte desta entrega.

---

# PARTE XVII — ENTREGA FINAL DO CURSOR

Ao concluir, o Cursor deve retornar:

1. resumo do que foi implementado;
2. migrações criadas;
3. endpoints adicionados;
4. arquivos principais alterados;
5. testes criados;
6. comandos executados;
7. resultados de typecheck, testes e build;
8. integrações externas que permanecem desabilitadas por ausência de credencial;
9. riscos residuais reais;
10. nenhuma pergunta genérica de “próximos passos” antes de concluir o escopo.
