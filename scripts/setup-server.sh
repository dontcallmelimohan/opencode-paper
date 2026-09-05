#!/usr/bin/env bash
# =============================================================
# setup-server.sh —— 服务器一次性环境准备脚本（论文助手平台）
#
# 为什么需要它：
#   matplotlib / numpy / Noto 中文字体等绘图依赖，是装在“服务器操作系统”
#   里的，并不在 git 仓库内，rsync / git 同步都不会携带这些文件。
#   所以一旦换新机器或重装系统，必须先跑本脚本把绘图环境还原，
#   再执行 scripts/deploy-thesis-web.sh 完成代码部署。
#
# 本脚本会安装（与后端 agent 提示词里写死的路径严格对应，勿随意改动）：
#   1) python3 + pip          —— agent 跑图表代码用的解释器（/usr/bin/python3）
#   2) matplotlib + numpy     —— 论文图表绘图库，pip --user 装到
#                                /root/.local/lib/python3.12/site-packages
#                                （agent 提示词假设可直接 import）
#   3) fonts-noto-cjk 字体    —— Noto Sans/Serif CJK 中文字体，安装到
#                                /usr/share/fonts/opentype/noto/（ttc 文件）
#   4) fc-cache 刷新字体缓存  —— 让字体对新会话立即可见
#
# 特性：幂等，可重复执行，重复执行不会破坏已有环境。
#
# 用法一（服务器上直接执行）：
#   bash scripts/setup-server.sh
#
# 用法二（本机 Mac 上执行，自动推到远端服务器跑，与 deploy 脚本一致）：
#   SSH_PASSWORD='服务器密码' bash scripts/setup-server.sh
# =============================================================

set -euo pipefail

REMOTE="${REMOTE:-root@8.130.129.149}"
SSH_PASSWORD="${SSH_PASSWORD:-}"

# 在服务器本机上执行的安装逻辑（root 运行）。
install_on_server() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "本脚本需要在服务器上以 root 运行：sudo bash scripts/setup-server.sh" >&2
    exit 1
  fi

  echo "==> [1/4] 安装系统包：python3 / pip / Noto CJK 中文字体"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    python3 python3-pip fonts-noto-cjk

  echo "==> [2/4] 安装 matplotlib + numpy（pip --user，装到 /root/.local）"
  # --user 装到 root 用户目录，系统 /usr/bin/python3 直接 import 即可，
  # 无需 venv；agent 的 bash 工具默认执行的就是这个 python3。
  python3 -m pip install --user --upgrade matplotlib numpy

  echo "==> [3/4] 刷新字体缓存"
  fc-cache -f >/dev/null

  echo "==> [4/4] 验证安装"
  python3 - <<'PY'
import matplotlib
print(f"matplotlib {matplotlib.__version__} OK")
PY
  if fc-list | grep -qi "noto.*cjk"; then
    echo "Noto CJK 字体已就绪："
    fc-list | grep -i "noto.*cjk" | head -n 2
  else
    echo "警告：未找到 Noto CJK 字体，请检查 fonts-noto-cjk 是否安装成功" >&2
  fi

  echo "==> 环境准备完成，可以继续执行 scripts/deploy-thesis-web.sh 部署代码"
}

# 本机模式：设置 SSH_PASSWORD 后，把整个脚本以 stdin 推送到远端 root 执行。
# 远端展开时 SSH_PASSWORD 为空，自然进入 install_on_server 分支，不会递归。
if [[ -n "$SSH_PASSWORD" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "sshpass is required when SSH_PASSWORD is set" >&2
    exit 1
  fi
  export SSHPASS="$SSH_PASSWORD"
  echo "==> 推送脚本到 ${REMOTE} 并远程执行"
  sshpass -e ssh -o StrictHostKeyChecking=accept-new "$REMOTE" \
    'bash -s' < "$0"
else
  install_on_server
fi
