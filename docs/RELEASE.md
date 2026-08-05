# Release e versionamento

Versão inicial do monorepo: **1.0.0** (semver `MAJOR.MINOR.PATCH`).

## Imagens publicadas

Registry: `ghcr.io/mond-day`

| Serviço | Imagem |
|---------|--------|
| API NestJS | `ghcr.io/mond-day/sonder-clinic-api` |
| Web Next.js | `ghcr.io/mond-day/sonder-clinic-web` |
| Worker | `ghcr.io/mond-day/sonder-clinic-worker` |

Tags geradas em release (`v1.0.0`):

- `1.0.0`
- `1.0`
- `latest`
- `sha-<gitsha>` (sempre)

Push em `main` sem tag gera imagem com versão `0.0.0-sha.<sha>` + tag `sha-<sha>` (não sobrescreve `latest`).

## Como publicar uma release

1. Atualize a versão nos `package.json` do root e apps (`1.0.0` → `1.0.1`).
2. Commit das mudanças.
3. Crie e envie a tag anotada:

```bash
git tag -a v1.0.1 -m "Release 1.0.1"
git push origin main
git push origin v1.0.1
```

4. O workflow `.github/workflows/release-images.yml` constrói as três imagens multi-stage e publica no GHCR.
5. Atualize o Swarm apontando `WEB_IMAGE` / `API_IMAGE` / `WORKER_IMAGE` para a tag desejada em `infra/swarm/stack.production.yml`.

## CI de qualidade

`.github/workflows/ci.yml` roda em PR e push em `main`: install, Prisma generate, typecheck, testes e build.

## Redes e deploy

Produção usa networks externas `digital_network` e `traefik_public`. Redis/MinIO são serviços existentes — não sobem nesta stack. Veja ADR `0002-production-configuration-and-secrets.md`.
