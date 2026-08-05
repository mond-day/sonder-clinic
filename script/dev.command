#!/bin/zsh
set -uo pipefail
cd "$(dirname "$0")/.."

# Mantém a janela aberta quando o script é aberto com duplo clique no Finder.
fail() {
  echo ""
  echo "Erro: $1"
  echo ""
  if [ -t 0 ]; then
    echo "Pressione Enter para fechar."
    read -r _
  fi
  exit 1
}

if ! command -v corepack >/dev/null 2>&1; then
  fail "Corepack não encontrado. Instale Node.js 24 LTS."
fi

# Instalações do PostgreSQL para macOS não colocam os binários no PATH.
for pg_bin in /Library/PostgreSQL/*/bin /Applications/Postgres.app/Contents/Versions/latest/bin /opt/homebrew/bin; do
  if [ -x "$pg_bin/pg_isready" ]; then
    PATH="$PATH:$pg_bin"
    break
  fi
done

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "Arquivo .env criado a partir de .env.example."
  else
    fail "Arquivo .env não encontrado."
  fi
fi

set -a
source .env
set +a

DB_HOST=$(node -e 'const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.hostname)') || fail "DATABASE_URL inválida no .env."
DB_PORT=$(node -e 'const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.port||"5432")')

db_reachable() {
  nc -z -w 2 "$DB_HOST" "$DB_PORT" >/dev/null 2>&1
}

if db_reachable; then
  echo "PostgreSQL já disponível em $DB_HOST:$DB_PORT."
elif command -v docker >/dev/null 2>&1; then
  echo "Subindo PostgreSQL via Docker..."
  docker compose -f infra/docker/docker-compose.dev.yml up -d || fail "Falha ao subir o PostgreSQL com Docker."
  echo -n "Aguardando o banco aceitar conexões"
  for _ in $(seq 1 30); do
    if db_reachable; then
      echo " pronto."
      break
    fi
    echo -n "."
    sleep 1
  done
  db_reachable || fail "O PostgreSQL não respondeu em $DB_HOST:$DB_PORT."
else
  fail "Nenhum PostgreSQL em $DB_HOST:$DB_PORT e o Docker não está instalado.
Suba um PostgreSQL local com o banco e o usuário definidos em DATABASE_URL,
ou instale o Docker Desktop para usar infra/docker/docker-compose.dev.yml."
fi

corepack pnpm install || fail "Falha em pnpm install."
corepack pnpm db:generate || fail "Falha ao gerar o Prisma Client."
# migrate deploy apenas aplica migrations pendentes: não exige shadow database,
# que o usuário do banco de desenvolvimento pode não ter permissão de criar.
corepack pnpm db:deploy || fail "Falha ao aplicar as migrations."
corepack pnpm db:seed || fail "Falha ao popular os dados de desenvolvimento."

echo ""
echo "Web:     http://localhost:3000"
echo "API:     http://localhost:${API_PORT:-4000}/api/v1"
echo "Swagger: http://localhost:${API_PORT:-4000}/docs"
echo "Login:   admin@sonder.local / Sonder@123"
echo ""

corepack pnpm dev
