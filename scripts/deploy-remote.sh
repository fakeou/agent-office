#!/usr/bin/env bash

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@agentoffice.top}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/agentoffice}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_ed25519_fakeou}"
SSH_OPTS=(
  -i "$SSH_KEY_PATH"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
)

echo "Deploying main to ${DEPLOY_HOST}:${DEPLOY_DIR}"

ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "bash -s -- '$DEPLOY_DIR'" <<'EOF'
set -euo pipefail

DEPLOY_DIR="$1"

cd "$DEPLOY_DIR"

git fetch --tags origin main
git checkout -B main FETCH_HEAD
git reset --hard "FETCH_HEAD"
git clean -fdx

if ! command -v python3.11 >/dev/null 2>&1; then
  dnf install -y python3.11
fi

export npm_config_python="$(command -v python3.11)"
export PYTHON="$npm_config_python"

pnpm install --frozen-lockfile
pnpm rebuild better-sqlite3 node-pty esbuild
pnpm --filter @agent-office/app build

systemctl restart agentoffice-api.service agentoffice-relay.service

echo "--- remote head ---"
git rev-parse HEAD
git tag --points-at HEAD || true

echo "--- service status ---"
systemctl status --no-pager agentoffice-api.service agentoffice-relay.service

echo "--- listeners ---"
ss -ltnp | grep -E '9000|9001'

echo "--- health ---"
curl -fsS http://127.0.0.1:9000/api/relay/health
printf '\n---\n'
curl -fsS http://127.0.0.1:9001/api/health
printf '\n---\n'

echo "--- frontend ---"
curl -fsS https://agentoffice.top/ | sed -n '1,20p'

echo "--- cli version ---"
jq -r .version "$DEPLOY_DIR/packages/cli/package.json"
EOF
