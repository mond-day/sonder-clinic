# Status de implementação

Atualizado em 05/08/2026 — versão **1.0.0**.

## Concluído

### Fundação e infraestrutura
- Monorepo pnpm/Turborepo (`web`, `api`, `worker`, `database`) na versão semver `1.0.0`.
- PostgreSQL 16 em dev; Redis **somente em produção**.
- Dockerfiles multi-stage para `api`, `web` e `worker`.
- Stack Swarm (`infra/swarm/stack.production.yml`) com networks externas `digital_network` e `traefik_public`, healthchecks, limites/reservas e secrets externos.
- CI (`.github/workflows/ci.yml`) e publicação GHCR (`.github/workflows/release-images.yml`).
- Decisões de produto e segredos em `docs/DUVIDAS_E_ASSUMPTIONS.md` + ADR `0002`.

### Auth e RBAC
- Argon2id + JWT + refresh rotativo.
- `PermissionsGuard` + `@RequirePermissions` nos endpoints sensíveis.

### Domínio implementado (API)
- Pacientes e agenda com conflitos.
- Prontuário, evolução assinável, correções por adendo, notas privadas.
- Anamnese (templates + respostas + assinatura + alertas).
- Odontograma (FDI, condições seed).
- Procedimentos, planos de tratamento, aprovação parcial, sessões.
- Documentos (templates, geração, assinatura, validação pública).
- Financeiro (recebíveis, pagamentos idempotentes, estornos, outbox).
- Comissões (regras).
- Comunicação (listagem de deliveries) e relatórios resumidos.
- Prescrição assistida (OpenAI default, mock, revisão obrigatória).
- Integrações com credenciais criptografadas (AES-256-GCM), mascaradas na leitura, auditoria.
- Settings: branding e documentos legais (Privacidade, Uso, Consentimento LGPD).

### Web
- Login real com cookies HttpOnly, renovação automática do JWT, logout e redirecionamento de sessão expirada.
- App shell e dashboard consumindo dados reais da API, com usuário autenticado e contexto de clínica/unidade.
- Consultas reais com estados de carregamento, vazio, erro e nova tentativa para pacientes, agenda, tratamentos, prontuário, odontogramas, documentos, financeiro, comissões, comunicação, integrações/settings e relatórios.
- Seletor de clínica no header persistido em `localStorage`, propagado para agenda, pacientes, tratamentos, documentos, financeiro, settings, dashboard e relatórios.
- Seletor de paciente persistido em prontuário, odontograma e documentos.
- Pacientes: criação e edição com Zod no client e servidor.
- Agenda: criação, remarcação e cancelamento; conflitos de profissional/cadeira permanecem validados no servidor.
- Prontuário: criação de evoluções; odontograma versionado com atualização incremental de dentes/condições.
- Financeiro: criação de títulos e recebimentos idempotentes.
- Settings: branding, documentos legais e credenciais de integrações; segredos são enviados em campos de senha, criptografados e retornam somente mascarados.
- Páginas legais `/legal/{privacidade|uso|consentimento}`.
- Branding via env (`BRAND_*`) com fallback.

## Auditoria UI ↔ API (05/08/2026)
- **Operacional para consulta:** dashboard, pacientes, agenda, planos, prontuário, odontogramas, modelos/documentos gerados, recebíveis, regras de comissão, deliveries, integrações, branding, legal e relatórios.
- **Operacional em autenticação:** login, refresh rotativo, cookies HttpOnly, logout, tratamento de 401 e RBAC aplicado na API.
- **Operacional em mutações principais:** pacientes (criar/editar), agenda (criar/remarcar/cancelar), evolução clínica, odontograma, títulos/recebimentos e settings/integrations.
- **Operacional em seletores:** clínica persistida e paciente explícito nos módulos clínicos/documentais.
- **Residual não bloqueante:** aprovação/execução de planos, assinatura/correção de evoluções, geração/assinatura de documentos, estornos, comissões e automações ainda usam endpoints sem fluxo visual completo.
- **Residual — relatórios:** resumo real disponível; exportação CSV e filtros de período/clínica ainda não foram implementados.

## Parcial / próximo
- Upload multipart MinIO, ClamAV (ainda desabilitado), assinatura A1 PKCS#12 real.
- Google Calendar OAuth completo, automações Evolution/Chatwoot em fila Redis.
- Fechamento de comissões + reconciliação financeira completa.
- Importação Codental (fluxo preparado; arquivos virão depois).
- Recuperação de senha e tela de sessões.

## Qualidade
```bash
pnpm typecheck && pnpm test && pnpm build
```
Validado em 05/08/2026 com typecheck, testes, build e smoke test autenticado da API cobrindo criação/edição de paciente, criação/conflito/remarcação/cancelamento de agenda, evolução, odontograma, título/recebimento, settings e credencial mascarada. O web ainda não possui testes automatizados; a suíte atual usa `--passWithNoTests`.

Imagens: ver `docs/RELEASE.md`.
