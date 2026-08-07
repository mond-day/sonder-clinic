# Contratos de API — Workspace Clínico

Atualizado na release **1.1.6**.

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

### Users / roles

```http
GET/POST /api/v1/users …
GET/POST/PATCH /api/v1/roles …
POST/DELETE /api/v1/users/:id/roles …
```

### Financeiro

```http
GET/POST /api/v1/payables …
GET      /api/v1/cashflow?clinicId&from&to
GET/POST/PATCH /api/v1/finance-recurrences
POST     /api/v1/finance-recurrences/:id/generate
```

Worker gera ocorrências devidas (`active && nextOccurrence <= hoje`) criando `Payable` ou `Receivable`.

### Branding / certificado / PatientMedia

```http
POST /api/v1/settings/branding/assets
GET  /api/v1/settings/branding/assets/:fileId
POST/DELETE /api/v1/settings/certificate
POST /api/v1/patients/:id/media
```

Storage: local em dev; MinIO/S3 em prod. Sem credenciais MinIO o upload **falha**.
AV: `AV_DRIVER=stub|disabled|clamav`; infectado rejeita; sem scan limpo → `PENDING`.

### Health

```http
GET /api/v1/health
```

Inclui status de storage, antivirus e observability (sem secrets).

## Fora de contrato HTTP

Odontograma 3D permanece protótipo.
