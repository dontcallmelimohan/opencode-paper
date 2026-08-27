#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE="${REMOTE:-root@8.130.129.149}"
REMOTE_ROOT="${REMOTE_ROOT:-/root/opencode-paper}"
APP_DIR="$ROOT/thesis-web/packages/app"
THESIS_WEB_ROOT="$ROOT/thesis-web"
SSH_PASSWORD="${SSH_PASSWORD:-}"

ssh_cmd=(ssh)
rsync_cmd=(rsync)
if [[ -n "$SSH_PASSWORD" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "sshpass is required when SSH_PASSWORD is set" >&2
    exit 1
  fi
  export SSHPASS="$SSH_PASSWORD"
  ssh_cmd=(sshpass -e ssh)
  rsync_cmd=(sshpass -e rsync)
fi

echo "==> Installing thesis-web dependencies"
cd "$THESIS_WEB_ROOT"
bun install

echo "==> Building thesis-web app"
cd "$APP_DIR"
bun run build

echo "==> Generating backend embedded UI map"
cd "$ROOT"
bun run scripts/generate-embedded-web-ui.ts

echo "==> Syncing repository to ${REMOTE}:${REMOTE_ROOT}"
"${rsync_cmd[@]}" -a \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '*/node_modules/' \
  --exclude '.DS_Store' \
  "$ROOT/" "$REMOTE:$REMOTE_ROOT/"

echo "==> Restarting remote backend"
"${ssh_cmd[@]}" -o StrictHostKeyChecking=accept-new "$REMOTE" <<'SSH'
set -euo pipefail

cd /root/opencode-paper/backend
/root/.bun/bin/bun install

systemctl stop opencode-paper-backend opencode-paper-frontend || true
systemctl reset-failed opencode-paper-backend opencode-paper-frontend || true

pkill -f 'python3 -m http.server 80 --bind 0.0.0.0' || true
pkill -f 'serve --port 80 --hostname 0.0.0.0' || true
pkill -f 'serve --port 4096 --hostname 0.0.0.0' || true

if [[ -f /tmp/http80.pid ]]; then
  kill "$(cat /tmp/http80.pid)" || true
fi

nohup /root/.bun/bin/bun run --cwd /root/opencode-paper/backend/packages/opencode \
  --conditions=browser ./src/index.ts serve --port 80 --hostname 0.0.0.0 \
  >/var/log/opencode-paper-backend.log 2>&1 &

sleep 3
ss -ltnp | grep -E ':80|:4173' || true
SSH

echo "==> Done"
