# Contratos de API — Workspace Clínico

Atualizado em 6 de agosto de 2026 (release **1.1.5**).

## Implementados

### Central de retornos / tarefas / lab / notificações

```http
GET/POST /api/v1/return-alerts …
GET/POST /api/v1/tasks …
GET/POST /api/v1/lab-cases …
GET/POST /api/v1/notifications …
```

### Automações de retorno

```http
GET    /api/v1/automation-rules?clinicId
POST   /api/v1/automation-rules
PATCH  /api/v1/automation-rules/:id
```

Trigger suportado: `APPOINTMENT_COMPLETED` → action `CREATE_RETURN_ALERT` (worker).

### Unidades e cadeiras

```http
GET    /api/v1/settings/units?clinicId
POST   /api/v1/settings/units
PATCH  /api/v1/settings/units/:id
POST   /api/v1/settings/units/:unitId/chairs
PATCH  /api/v1/settings/chairs/:id
```

### Comissões (eventos / competência)

```http
GET  /api/v1/commission-events?clinicId&from&to&professionalId&periodId
GET  /api/v1/commission-periods?clinicId
POST /api/v1/commission-periods
POST /api/v1/commission-periods/:id/close
POST /api/v1/commission-periods/:id/reopen
```

Eventos gerados no `POST /receivables/:id/payments` quando há tratamento + regra elegível.

### Users / roles

```http
GET/POST /api/v1/users …
GET/POST/PATCH /api/v1/roles …
POST/DELETE /api/v1/users/:id/roles …
```

### Financeiro ampliado (parcial)

```http
GET/POST /api/v1/payables …
GET      /api/v1/cashflow?clinicId&from&to
```

### Branding / certificado / PatientMedia

```http
POST /api/v1/settings/branding/assets
GET  /api/v1/settings/branding/assets/:fileId
POST/DELETE /api/v1/settings/certificate
POST /api/v1/patients/:id/media
```

Storage: local em dev (`STORAGE_DRIVER=local`); MinIO/S3 em prod. Sem credenciais MinIO o upload **falha** (sem falso sucesso).

## Ainda pendentes

```http
GET/POST /api/v1/finance-recurrences
```

Odontograma 3D permanece protótipo (fora de contrato HTTP).
