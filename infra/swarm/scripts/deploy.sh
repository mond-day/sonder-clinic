#!/usr/bin/env bash
# Deploy oficial de produção (Docker Swarm).
# Aguarda o bootstrap/migrate antes de considerar o release concluído.
set -euo pipefail

STACK_NAME="${STACK_NAME:-sonder-clinic}"
COMPOSE_FILE="${COMPOSE_FILE:-$(cd "$(dirname "$0")/.." && pwd)/stack.production.yml}"
MIGRATE_SERVICE="${STACK_NAME}_migrate"
WAIT_SECONDS="${BOOTSTRAP_WAIT_SECONDS:-180}"

required=(API_IMAGE WEB_IMAGE WORKER_IMAGE DATABASE_URL REDIS_URL S3_ENDPOINT S3_BUCKET WEB_URL API_URL)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Defina ${name} antes do deploy." >&2
    exit 1
  fi
done

if [[ "${COOKIE_SECURE:-true}" != "true" ]]; then
  echo "COOKIE_SECURE deve ser true em produção." >&2
  exit 1
fi

if [[ "${WEB_URL}" == *localhost* || "${WEB_URL}" == *127.0.0.1* ]]; then
  echo "WEB_URL não pode apontar para localhost em produção." >&2
  exit 1
fi

if [[ "${WEB_URL}" != https://* ]]; then
  echo "WEB_URL deve usar HTTPS em produção." >&2
  exit 1
fi

token="${INITIAL_SETUP_TOKEN:-}"
if [[ ${#token} -lt 16 ]]; then
  echo "INITIAL_SETUP_TOKEN deve ter ao menos 16 caracteres (secret da API; o operador cola o mesmo valor em /setup)." >&2
  exit 1
fi

ensure_secret() {
  local name="$1"
  local value="$2"
  if docker secret inspect "${name}" >/dev/null 2>&1; then
    echo "Secret ${name} já existe (Docker secrets são imutáveis; remova manualmente para rotacionar)."
    return 0
  fi
  printf '%s' "${value}" | docker secret create "${name}" -
  echo "Secret ${name} criado."
}

ensure_secret database_url "${DATABASE_URL}"
ensure_secret initial_setup_token "${INITIAL_SETUP_TOKEN}"
if [[ -n "${DATABASE_ADMIN_URL:-}" ]]; then
  ensure_secret database_admin_url "${DATABASE_ADMIN_URL}"
elif ! docker secret inspect database_admin_url >/dev/null 2>&1; then
  # Secret externo obrigatório no stack; placeholder vazio se o admin URL não for usado.
  printf '' | docker secret create database_admin_url -
  echo "Secret database_admin_url criado (vazio). Defina DATABASE_ADMIN_URL para criar o database automaticamente."
fi

echo "Deploying ${STACK_NAME} from ${COMPOSE_FILE}"
docker stack deploy -c "${COMPOSE_FILE}" "${STACK_NAME}"

echo "Aguardando bootstrap/migrate (${WAIT_SECONDS}s)..."
deadline=$((SECONDS + WAIT_SECONDS))
while (( SECONDS < deadline )); do
  tasks="$(docker service ps "${MIGRATE_SERVICE}" --format '{{.CurrentState}} {{.Error}}' 2>/dev/null || true)"
  if echo "${tasks}" | grep -qiE 'Failed|Rejected'; then
    echo "Migration falhou:" >&2
    echo "${tasks}" >&2
    docker service logs --tail 80 "${MIGRATE_SERVICE}" >&2 || true
    echo "Release abortado. Não execute seed/reset. Use: prisma migrate status" >&2
    exit 1
  fi
  if echo "${tasks}" | grep -qiE 'Running|Complete'; then
    logs="$(docker service logs --tail 50 "${MIGRATE_SERVICE}" 2>&1 || true)"
    if echo "${logs}" | grep -q '"event":"complete"'; then
      echo "Bootstrap concluído."
      exit 0
    fi
    if echo "${logs}" | grep -q '"event":"keep_alive"'; then
      echo "Bootstrap concluído (serviço migrate em keep-alive)."
      exit 0
    fi
  fi
  sleep 3
done

echo "Timeout aguardando migrate. Últimos logs:" >&2
docker service logs --tail 80 "${MIGRATE_SERVICE}" >&2 || true
exit 1
