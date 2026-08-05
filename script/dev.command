#!/bin/zsh
set -e
cd "$(dirname "$0")/.."

if ! command -v corepack >/dev/null 2>&1; then
  echo "Corepack não encontrado. Instale Node.js 24 LTS."
  exit 1
fi

docker compose -f infra/docker/docker-compose.dev.yml up -d
corepack pnpm install
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev
