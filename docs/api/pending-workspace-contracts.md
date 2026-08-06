# Contratos de API — Workspace Clínico

Atualizado em 5 de agosto de 2026. Endpoints **implementados** vs ainda pendentes.

## Implementados (`apps/api/src/modules/workspace`)

Permissões novas (seed): `return_alert.view|manage`, `task.view|manage`, `lab_case.view|manage`, `notification.view`.

### Central de retornos

```http
GET    /api/v1/return-alerts?clinicId&status&assigneeId&specialty&search
GET    /api/v1/return-alerts/summary?clinicId
POST   /api/v1/return-alerts
PATCH  /api/v1/return-alerts/:id
POST   /api/v1/return-alerts/:id/schedule
```

### Tarefas

```http
GET    /api/v1/tasks?clinicId&status&assigneeId&dueFrom&dueTo
POST   /api/v1/tasks
PATCH  /api/v1/tasks/:id
```

### Laboratório & casos

```http
GET    /api/v1/lab-cases?clinicId&status&specialty
POST   /api/v1/lab-cases
PATCH  /api/v1/lab-cases/:id/status
GET    /api/v1/lab-cases/:id/history
```

### Notificações

```http
GET  /api/v1/notifications?clinicId&unreadOnly&category
POST /api/v1/notifications/:id/read
POST /api/v1/notifications/read-all
```

Sem polling agressivo no front: o `WorkspaceProvider` revalida na troca de rota e ao abrir o drawer.

## Ainda pendentes

### Financeiro ampliado

```http
GET/POST /api/v1/payables
GET/POST /api/v1/finance-recurrences
GET      /api/v1/cashflow?clinicId&from&to
GET      /api/v1/commission-events?period&professionalId
```

### Equipe e permissões

```http
GET/POST /api/v1/users
GET/POST /api/v1/roles
PATCH    /api/v1/users/:id/roles
```

### Automações de retorno

```http
GET/POST /api/v1/automation-rules
```

Modelo `AutomationRule` pode existir no schema; a exposição HTTP ainda não.

### Storage clínico e certificado A1

```http
POST   /api/v1/patient-media/upload
POST   /api/v1/settings/certificate
DELETE /api/v1/settings/certificate
```

Certificado A1 (`POST/DELETE /settings/certificate`) grava via `@sonder/storage`
(local em dev, MinIO/S3 em prod). Sem credenciais MinIO o upload falha explicitamente.
`PatientMedia` multipart genérico ainda não tem rota HTTP — anexos clínicos usam `fileObjectId` já existente.

## Adicionados nesta refatoração

```http
GET/POST  /api/v1/settings/agenda-tags
PATCH     /api/v1/settings/agenda-tags/:id
GET/POST  /api/v1/prescriptions
```

`POST/PUT /appointments` ganhou campos opcionais backward-compatible: `category`, `tagIds`, `reminderEnabled` e `reminderLeadMinutes`.
