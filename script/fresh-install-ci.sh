#!/usr/bin/env bash
# CI: PostgreSQL acessível sem o database alvo; bootstrap + setup + login + redeploy idempotente.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

API_BASE="${API_URL:-http://localhost:4000}/api/v1"
ADMIN_EMAIL="${FRESH_INSTALL_ADMIN_EMAIL:-admin.install@example.com}"
ADMIN_PASSWORD="${FRESH_INSTALL_ADMIN_PASSWORD:-Install@12345}"

verify() {
  corepack pnpm --filter @sonder/database exec tsx scripts/fresh-install-verify.ts "$1"
}

verify precheck
corepack pnpm db:bootstrap
verify post-bootstrap

corepack pnpm --filter @sonder/api start > /tmp/fresh-api.log 2>&1 &
API_PID=$!
cleanup() { kill "${API_PID}" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 60); do
  if curl -sf "${API_BASE}/health" >/dev/null; then
    echo "API pronta"
    break
  fi
  if ! kill -0 "${API_PID}" 2>/dev/null; then
    echo "API morreu:" >&2
    tail -50 /tmp/fresh-api.log >&2 || true
    exit 1
  fi
  sleep 1
  if [[ "${i}" -eq 60 ]]; then
    echo "timeout API" >&2
    tail -50 /tmp/fresh-api.log >&2 || true
    exit 1
  fi
done

status="$(curl -sf "${API_BASE}/setup/status")"
echo "status inicial: ${status}"
echo "${status}" | grep -q '"required":true'

code_empty="$(curl -s -o /tmp/setup-empty.json -w '%{http_code}' -X POST "${API_BASE}/setup/initialize" -H 'Content-Type: application/json' -d '{}')"
if [[ "${code_empty}" != "400" ]]; then
  echo "esperado 400 com payload vazio, obteve ${code_empty}" >&2
  cat /tmp/setup-empty.json >&2
  exit 1
fi

payload="$(cat <<JSON
{
  "organization": { "legalName": "Clínica Fresh Install Ltda", "tradeName": "Fresh Clinic", "taxId": "12345678000199" },
  "clinic": { "legalName": "Clínica Fresh Install Ltda", "tradeName": "Fresh Clinic" },
  "unit": { "name": "Unidade principal", "city": "Cuiabá" },
  "admin": { "name": "Admin Inicial", "email": "${ADMIN_EMAIL}", "password": "${ADMIN_PASSWORD}" }
}
JSON
)"

code_ok="$(curl -s -o /tmp/setup-ok.json -w '%{http_code}' -X POST "${API_BASE}/setup/initialize" \
  -H 'Content-Type: application/json' -d "${payload}")"
if [[ "${code_ok}" != "201" ]]; then
  echo "setup falhou: HTTP ${code_ok}" >&2
  cat /tmp/setup-ok.json >&2
  exit 1
fi

status2="$(curl -sf "${API_BASE}/setup/status")"
echo "status após setup: ${status2}"
echo "${status2}" | grep -q '"required":false'

code_again="$(curl -s -o /tmp/setup-again.json -w '%{http_code}' -X POST "${API_BASE}/setup/initialize" \
  -H 'Content-Type: application/json' -d "${payload}")"
if [[ "${code_again}" != "409" && "${code_again}" != "410" ]]; then
  echo "segunda inicialização deveria ser 409/410, obteve ${code_again}" >&2
  cat /tmp/setup-again.json >&2
  exit 1
fi

code_login="$(curl -s -o /tmp/setup-login.json -w '%{http_code}' -X POST "${API_BASE}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}")"
if [[ "${code_login}" != "201" && "${code_login}" != "200" ]]; then
  echo "login do primeiro admin falhou: HTTP ${code_login}" >&2
  cat /tmp/setup-login.json >&2
  exit 1
fi

corepack pnpm db:bootstrap
verify post-redeploy

echo "fresh-install: PASS"
