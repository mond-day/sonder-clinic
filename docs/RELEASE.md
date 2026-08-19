# Release e versionamento

Versão atual do monorepo: **1.2.4** (semver `MAJOR.MINOR.PATCH`).

**Padrão de tag: `v1.2.4`.** Não use `v.1.2.4` (ponto extra após o `v`) — o GitHub ignora esse formato.

## Como lançar (v1.2.3)

1. Atualize a versão nos `package.json` do root, apps e packages (`1.2.3` → `1.2.4` se for o caso).
2. Faça o commit das mudanças na `main`.
3. Crie a tag anotada e envie:

```bash
git tag -a v1.2.4 -m "Release 1.2.4"
git push origin main
git push origin v1.2.4
```

4. No GitHub Actions, o workflow **Release** roda sozinho: testes essenciais (CI + instalação limpa) → imagens no GHCR → deploy.
5. Se `SWARM_HOST` e `SWARM_SSH_KEY` estiverem nos secrets do repositório, a VPS recebe as imagens e o `deploy.sh` aplica banco + migrations.
6. Abra o domínio HTTPS do frontend.
7. **Primeira instalação:** página `/setup` — token de instalação, nome da clínica, primeiro usuário, senha.
8. **Já instalado:** página `/login` com os usuários existentes.
9. Confirme que a versão no GHCR é `1.2.4` (e também `1.2` / `latest` / `sha-<commit>`).

Não rode seed de demo em produção. O operador não precisa de terminal na API para o primeiro admin.

## Imagens publicadas

Registry: `ghcr.io/mond-day` (Docker GHCR — **não** npm GitHub Packages)

| Serviço | Imagem |
|---------|--------|
| API NestJS | `ghcr.io/mond-day/sonder-clinic-api` |
| Web Next.js | `ghcr.io/mond-day/sonder-clinic-web` |
| Worker | `ghcr.io/mond-day/sonder-clinic-worker` |

Tags geradas no workflow **Release** (`v1.2.4`):

- `1.2.4`
- `1.2`
- `latest`
- `sha-<gitsha>`

Push em `main` sem tag ainda gera imagem de desenvolvimento `0.0.0-sha.<sha>` + `sha-<sha>` (workflow `release-images.yml`, **não** sobrescreve `latest`).

## O que o GitHub precisa para deploy automático

Secrets do repositório: `SWARM_HOST`, `SWARM_USER`, `SWARM_SSH_KEY`.
Variável opcional: `SWARM_DEPLOY_DIR` (default `/opt/sonder-clinic`).

Na VPS, uma vez só:

- Docker Swarm + Traefik + redes `digital_network` e `traefik_public`
- arquivo `/opt/sonder-clinic/.env` com `DATABASE_URL`, `WEB_URL`, `API_URL`, `REDIS_URL`, S3, `INITIAL_SETUP_TOKEN`, etc.
- login no GHCR para puxar as imagens
- secrets Docker (`jwt_access_secret`, …)

Sem esses secrets no GitHub, o Release **ainda testa e publica as imagens**. Aí, na VPS:

```bash
export API_IMAGE=ghcr.io/mond-day/sonder-clinic-api:1.2.4
export WEB_IMAGE=ghcr.io/mond-day/sonder-clinic-web:1.2.4
export WORKER_IMAGE=ghcr.io/mond-day/sonder-clinic-worker:1.2.4
./infra/swarm/scripts/deploy.sh
```

Bootstrap, migrate e `/setup`: `docs/FRESH_INSTALL.md`. Também ADR `0002-production-configuration-and-secrets.md` e `PRODUCTION_READINESS.md`.
