#!/usr/bin/env bash
# Deploy disparado pelo GitHub Actions após publicar imagens de uma tag vX.Y.Z.
# Sem SWARM_HOST/SWARM_SSH_KEY, só informa o comando equivalente na VPS (não falha o release).
set -euo pipefail

VERSION="${VERSION:?Defina VERSION (sem o prefixo v, ex.: 1.2.4)}"
REGISTRY="${REGISTRY:-ghcr.io/mond-day}"
API_IMAGE_REF="${REGISTRY}/sonder-clinic-api:${VERSION}"
WEB_IMAGE_REF="${REGISTRY}/sonder-clinic-web:${VERSION}"
WORKER_IMAGE_REF="${REGISTRY}/sonder-clinic-worker:${VERSION}"

if [[ -z "${SWARM_HOST:-}" || -z "${SWARM_SSH_KEY:-}" ]]; then
  echo "Secrets SWARM_HOST / SWARM_SSH_KEY não configurados no GitHub."
  echo "Imagens publicadas. Na VPS, com o .env de produção já carregado:"
  echo "  export API_IMAGE=${API_IMAGE_REF}"
  echo "  export WEB_IMAGE=${WEB_IMAGE_REF}"
  echo "  export WORKER_IMAGE=${WORKER_IMAGE_REF}"
  echo "  ./infra/swarm/scripts/deploy.sh"
  echo "O script aplica bootstrap + migrate e sobe web/api/worker."
  exit 0
fi

USER_NAME="${SWARM_USER:-root}"
REMOTE_DIR="${SWARM_DEPLOY_DIR:-/opt/sonder-clinic}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
KEY_FILE="$(mktemp)"
cleanup() { rm -f "${KEY_FILE}"; }
trap cleanup EXIT
printf '%s\n' "${SWARM_SSH_KEY}" > "${KEY_FILE}"
chmod 600 "${KEY_FILE}"

SSH=(ssh -i "${KEY_FILE}" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes "${USER_NAME}@${SWARM_HOST}")
SCP=(scp -i "${KEY_FILE}" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes)

echo "Enviando stack ${VERSION} para ${USER_NAME}@${SWARM_HOST}:${REMOTE_DIR}"
"${SSH[@]}" "mkdir -p '${REMOTE_DIR}/infra/swarm/scripts'"
"${SCP[@]}" "${ROOT}/infra/swarm/stack.production.yml" "${USER_NAME}@${SWARM_HOST}:${REMOTE_DIR}/infra/swarm/stack.production.yml"
"${SCP[@]}" "${ROOT}/infra/swarm/scripts/deploy.sh" "${USER_NAME}@${SWARM_HOST}:${REMOTE_DIR}/infra/swarm/scripts/deploy.sh"
"${SSH[@]}" "chmod +x '${REMOTE_DIR}/infra/swarm/scripts/deploy.sh'"

"${SSH[@]}" "bash -s" <<EOF
set -euo pipefail
cd '${REMOTE_DIR}'
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
export API_IMAGE='${API_IMAGE_REF}'
export WEB_IMAGE='${WEB_IMAGE_REF}'
export WORKER_IMAGE='${WORKER_IMAGE_REF}'
./infra/swarm/scripts/deploy.sh
EOF

echo "Deploy ${VERSION} concluído."
