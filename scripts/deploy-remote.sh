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

wait_for_file() {
  local path="$1"
  local attempts="${2:-15}"
  local sleep_seconds="${3:-1}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if [[ -f "$path" ]]; then
      return 0
    fi
    sleep "$sleep_seconds"
  done

  echo "Timed out waiting for file: $path" >&2
  return 1
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-15}"
  local sleep_seconds="${3:-2}"
  local label="${4:-$1}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if curl --max-time 10 -fsS "$url" >/dev/null; then
      return 0
    fi
    sleep "$sleep_seconds"
  done

  echo "Timed out waiting for ${label}: $url" >&2
  return 1
}

swap_frontend_dist() {
  local live_dir="$DEPLOY_DIR/apps/app/dist"
  local next_dir="$DEPLOY_DIR/apps/app/dist-deploy"
  local backup_dir="$DEPLOY_DIR/apps/app/dist-prev"

  rm -rf "$backup_dir"

  if [[ -d "$live_dir" ]]; then
    mv "$live_dir" "$backup_dir"
  fi

  if mv "$next_dir" "$live_dir"; then
    rm -rf "$backup_dir"
    return 0
  fi

  rm -rf "$live_dir"
  if [[ -d "$backup_dir" ]]; then
    mv "$backup_dir" "$live_dir"
  fi

  echo "Failed to swap frontend dist directories" >&2
  return 1
}

cd "$DEPLOY_DIR"

git fetch --tags origin main
git checkout -B main FETCH_HEAD
git reset --hard "FETCH_HEAD"
git clean -fdx -e apps/app/dist -e apps/app/dist-prev -e apps/app/dist-deploy

if ! command -v python3.11 >/dev/null 2>&1; then
  dnf install -y python3.11
fi

export npm_config_python="$(command -v python3.11)"
export PYTHON="$npm_config_python"

pnpm install --frozen-lockfile
pnpm rebuild better-sqlite3 node-pty esbuild
rm -rf "$DEPLOY_DIR/apps/app/dist-deploy"
pnpm --filter @agent-office/app exec tsc -b
pnpm --filter @agent-office/app exec vite build --outDir dist-deploy --emptyOutDir
wait_for_file "$DEPLOY_DIR/apps/app/dist-deploy/index.html" 20 1
swap_frontend_dist
wait_for_file "$DEPLOY_DIR/apps/app/dist/index.html" 20 1

systemctl restart agentoffice-api.service agentoffice-relay.service
wait_for_http "http://127.0.0.1:9000/api/relay/health" 20 1 "relay health"
wait_for_http "http://127.0.0.1:9001/api/health" 20 1 "api health"
wait_for_http "https://agentoffice.top/" 20 1 "frontend home"
wait_for_http "https://agentoffice.top/office" 20 1 "frontend office"

echo "--- remote head ---"
git rev-parse HEAD
git tag --points-at HEAD || true

echo "--- service status ---"
systemctl status --no-pager agentoffice-api.service agentoffice-relay.service

echo "--- listeners ---"
ss -ltnp | grep -E '9000|9001'

echo "--- health ---"
curl --max-time 10 -fsS http://127.0.0.1:9000/api/relay/health
printf '\n---\n'
curl --max-time 10 -fsS http://127.0.0.1:9001/api/health
printf '\n---\n'

echo "--- frontend ---"
curl --max-time 10 -fsSI https://agentoffice.top/ | sed -n '1,20p'
printf '\n---\n'
curl --max-time 10 -fsSI https://agentoffice.top/office | sed -n '1,20p'

echo "--- cli version ---"
jq -r .version "$DEPLOY_DIR/packages/cli/package.json"
EOF
