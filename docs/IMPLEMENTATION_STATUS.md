# Status de implementação

Atualizado — remessa **Release Candidate / estabilização final** (pós `d95c4c2`).

## Remessa RC — estabilização final

### DONE (código)
- **Anamnese P0:** respostas no detail modal (`formatAnamnesisAnswer` + seções); lifecycle seguro (`sourceResponseId`, origem permanece SIGNED até finalize → `SUPERSEDED`); concorrência 409; auditoria `update_draft_created` / `superseded`; cancel com motivo obrigatório; confirmações UI (sem `window.confirm`)
- **Financeiro P0/P1:** removido campo Desconto ignorado no recebimento; filtro vencidos usa `effectiveStatus`; filtros avançados reais (período de vencimento); detalhe de payables
- **Documentos P1:** `publishDocumentTemplate` revalida snapshot (`validateDocumentTemplateStructure`) → 400 com lista de erros
- **Relatórios P1:** `production-procedure` = produção clínica; `receipt-procedure` = recebimento alocado; profissional exclui correções + valor clínico
- **CI/Release P0:** `pnpm lint` no CI; `release-images` gated por `workflow_run` CI success
- **Security/ops P1:** fail-fast prod (`assertProductionEnvironment`); `SWAGGER_ENABLED`; `/api/v1/health/ready`; CORS explícito em prod
- **Google watch P2:** claim atômico de lease (SQL condicional)
- **Testes:** lifecycle puro, production-env, template structure, produção clínica/recebimento; E2E A–G alinhados ao aceite

### PARTIAL / NO-GO (ops)
| Item | Motivo |
|------|--------|
| Secrets/HTTPS/Redis/S3/SMTP reais | Fora do repo — ver `PRODUCTION_READINESS.md` |
| Google watch em prod | Exige URL HTTPS + OAuth; preferir 1 réplica worker ou lease CAS |
| E2E suite completa em CI | Depende de pipeline verde com serviços |

### Migration
- `20260810020000_anamnesis_source_response` — coluna `sourceResponseId` + índices

## Remessa P0/P1/P2 pós-auditoria (preservada)

Lock 409, reopen, hash, revoke, EXPIRED job, FKs, produção financeira (agora separada), Google auto-renew — ver histórico abaixo.

### DONE (código) — remessa anterior
- **Anamnese P0:** lock `409` em `AWAITING_SIGNATURE`; `POST .../reopen-draft`; hash canônico; revoke; `clinicId ∈ org`; FKs; `effectiveStatus`; job `EXPIRED`
- **Documentos admin P1:** PATCH + editor + validate
- **Google watch P2:** auto-renew configurável

### Migration anterior
- `20260810010000_anamnesis_p0_fks_cancelled`

## Fatia 4 / Última milha / Fatia 3 — preservadas

Agenda, pacientes, prontuário, tratamentos, documentos paciente, tarefas, financeiro base, Google OAuth — **não reconstruídos**.

## Docs

Índice em `docs/README.md`. Specs gigantes só em `docs/archive/`.
