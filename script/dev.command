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

API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"
ROOT="$(pwd)"

# Libera portas/processos de uma sessão anterior deste repo (evita EADDRINUSE no nest --watch).
free_port() {
  local port="$1"
  local pids
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  [ -z "$pids" ] && return 0

  local pid cmd
  for pid in $pids; do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    case "$cmd" in
      *"$ROOT"*|*sonder-clinic*|*"nest start"*|*"next dev"*|*"next-server"*|*"tsx"*"src/main.ts"*)
        echo "Encerrando processo antigo na porta $port (PID $pid)."
        kill "$pid" 2>/dev/null || true
        ;;
      *)
        fail "Porta $port em uso por outro processo (PID $pid): $cmd
Encerre-o ou altere API_PORT/WEB_PORT no .env."
        ;;
    esac
  done

  for _ in $(seq 1 20); do
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 || return 0
    sleep 0.25
  done
  # Último recurso: processos órfãos do nest/next deste monorepo.
  pkill -f "$ROOT/apps/api/.*nest.js start" 2>/dev/null || true
  pkill -f "$ROOT/apps/web/.*next.*(dev|start)" 2>/dev/null || true
  sleep 0.5
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && \
    fail "Não foi possível liberar a porta $port."
}

free_port "$API_PORT"
free_port "$WEB_PORT"

echo ""
echo "Web:     http://localhost:$WEB_PORT"
echo "API:     http://localhost:$API_PORT/api/v1"
echo "Swagger: http://localhost:$API_PORT/docs"
echo "Login:   admin@sonder.local / Sonder@123"
echo ""

corepack pnpm dev
