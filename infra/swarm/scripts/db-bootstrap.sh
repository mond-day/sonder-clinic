#!/usr/bin/env bash
# Wrapper local/CI do bootstrap de produção (cria DB se necessário + prisma migrate deploy).
set -euo pipefail
cd "$(dirname "$0")/../../.."
exec corepack pnpm db:bootstrap
