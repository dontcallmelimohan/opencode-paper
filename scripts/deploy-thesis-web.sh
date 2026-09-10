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
  # 强制走密码认证：不先试公钥，避免 sshpass 在公钥失败后密码对不上（该服务器偶发）
  ssh_cmd=(sshpass -e ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no)
  rsync_cmd=(sshpass -e rsync -e "ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no")
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
  --exclude '*.map' \
  "$ROOT/" "$REMOTE:$REMOTE_ROOT/"

# [论文助手定制] dist 是纯构建产物：单独用 --delete 清掉远端累积的历史产物
# （旧 hash js/css/map），避免 rsync 只增不删导致服务器 dist 膨胀到几百 MB。
echo "==> Pruning stale dist assets on remote"
"${rsync_cmd[@]}" -a --delete --exclude '*.map' \
  "$APP_DIR/dist/" "$REMOTE:$REMOTE_ROOT/thesis-web/packages/app/dist/"

echo "==> Restarting remote backend"
"${ssh_cmd[@]}" -o StrictHostKeyChecking=accept-new "$REMOTE" <<'SSH'
set -euo pipefail

cd /root/opencode-paper/backend
/root/.bun/bin/bun install

legacy_id_file=/root/opencode-paper/.multi-user-legacy-user-id
if [[ ! -s "$legacy_id_file" ]]; then
  python3 - <<'PY' > "$legacy_id_file" || true
import json
from pathlib import Path

path = Path.home() / ".local/share/opencode/thesis-auth.json"
try:
    users = json.loads(path.read_text()).get("users", [])
except Exception:
    users = []
if len(users) == 1:
    print(users[0]["id"])
PY
fi
legacy_user_id="$(cat "$legacy_id_file" 2>/dev/null || true)"
export OPENCODE_MULTIUSER_LEGACY_USER_ID="$legacy_user_id"

systemctl stop opencode-paper-backend opencode-paper-frontend || true
systemctl reset-failed opencode-paper-backend opencode-paper-frontend || true

pkill -f 'python3 -m http.server 80 --bind 0.0.0.0' || true
pkill -f 'serve --port 80 --hostname 0.0.0.0' || true
pkill -f 'serve --port 4096 --hostname 0.0.0.0' || true

if [[ -f /tmp/http80.pid ]]; then
  kill "$(cat /tmp/http80.pid)" || true
fi

# 允许多人自助注册：默认的安全策略会在已有用户后关闭注册。
export OPENCODE_AUTH_OPEN_REGISTRATION=true

nohup env OPENCODE_AUTH_OPEN_REGISTRATION=true /root/.bun/bin/bun run --cwd /root/opencode-paper/backend/packages/opencode \
  --conditions=browser ./src/index.ts serve --port 80 --hostname 0.0.0.0 \
  >/var/log/opencode-paper-backend.log 2>&1 &

sleep 3
ss -ltnp | grep -E ':80|:4173' || true
SSH

echo "==> Done"
