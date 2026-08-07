# Status de implementação

Atualizado — versão **1.1.6** + **QA P0** + **Tratamentos** + **Documentos** + **backlog P1/P2 (fatias A–J)**.

## Concluído nesta entrega — Backlog P1/P2 fatia J

### Documentos
- Editor dedicado de solicitação de exame (`ExamRequestEditor`) — tipo `EXAM_REQUEST`, itens, indicação, urgência

### Tarefas
- Participantes / comentários / anexos (API + UI no detalhe; anexos exigem storage)

### Comunicação
- CRUD `MessagingChannel` + envio manual (`POST /communication/send`)
- EMAIL via SMTP real; WHATSAPP/SMS stub honesto (FAILED sem fingir sucesso)

### Retornos / worker
- `allowedHours` aplicado no worker (`America/Cuiaba`); deferral com `leaseUntil` quando todas as regras estão fora da janela
- UI de regra de automação grava `start`/`end`/`weekdays`

### Integrações
- Superfície OAuth Google Calendar (`GET .../oauth-status`, `POST .../oauth/start`) — stub PARTIAL honesto (A38)

## Preservado (não refeito)

- Fatias A–I, QA P0, Tratamentos, Documentos workspace, checklist de tarefas, templates/opt-in

## Pendente / parcial deliberado

| Item | Estado |
|------|--------|
| Google Calendar OAuth + sync bidirecional | **PARTIAL** stub (A38) — não GO |
| WhatsApp outbound real (Evolution send) | Stub — delivery FAILED explícito |
| Tarefas: recorrência / histórico de atividade | Pendente (mínimo útil entregue) |
| Retornos: duplicar regra / testar regra / frequência avançada | Parcial (`allowedHours` OK) |
| Odontograma 3D / áudio-transcrição | Fora de escopo |
| ImageAnnotation API | Pendente |

## Docs

Índice em `docs/README.md`. Specs gigantes só em `docs/archive/`.

**Esta fatia J encerra o backlog residual P1/P2 viável do QA** (exceto itens explicitamente fora de escopo ou PARTIAL documentados).
