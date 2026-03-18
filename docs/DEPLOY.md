# Deployment

AgentOffice production is currently deployed to `root@agentoffice.top` in `/opt/agentoffice`.

The public site and services are:

- Frontend static files: `/opt/agentoffice/apps/app/dist`
- API service: `agentoffice-api.service`
- Relay service: `agentoffice-relay.service`
- API listen address: `127.0.0.1:9001`
- Relay listen address: `127.0.0.1:9000`

## One-Command Deploy

From the repo root:

```bash
bash scripts/deploy-remote.sh
```

Or via npm script:

```bash
npm run deploy:remote
```

The deploy script will:

1. SSH to `root@agentoffice.top`
2. Reset `/opt/agentoffice` to `origin/main`
3. Install dependencies with `pnpm install --frozen-lockfile`
4. Install `python3.11` if the server does not already have it
5. Export `npm_config_python` / `PYTHON` so `node-gyp` uses Python 3.11
6. Rebuild native modules: `better-sqlite3`, `node-pty`, `esbuild`
7. Build the frontend app
8. Restart `agentoffice-api.service` and `agentoffice-relay.service`
9. Verify listeners, health endpoints, frontend HTML, and CLI version

## Local Requirements

The machine running the deploy command needs:

- SSH access to `root@agentoffice.top`
- The deploy SSH key at `~/.ssh/id_ed25519_fakeou`
- Git access to `git@github.com:fakeou/agent-office.git`

If needed, override the defaults:

```bash
SSH_KEY_PATH=~/.ssh/your_key bash scripts/deploy-remote.sh
DEPLOY_HOST=root@example.com DEPLOY_DIR=/srv/agentoffice bash scripts/deploy-remote.sh
```

## Manual Verification

If you want to inspect the server after deployment:

```bash
ssh -i ~/.ssh/id_ed25519_fakeou root@agentoffice.top
cd /opt/agentoffice
git rev-parse HEAD
systemctl status --no-pager agentoffice-api.service agentoffice-relay.service
curl -fsS http://127.0.0.1:9000/api/relay/health
curl -fsS http://127.0.0.1:9001/api/health
```
