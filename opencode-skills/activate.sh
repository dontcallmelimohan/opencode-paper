#!/bin/bash
# activate.sh — 把某个分类的 skill 软链到 opencode 的 skills 目录
# 用法:
#   ./activate.sh 01                      # 激活"文献与提纲（研究启动）"到 ~/.config/opencode/skills
#   ./activate.sh 04 /path/to/skills     # 激活"论文评审"到指定目录
#   ./activate.sh all                     # 激活全部四个分类
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CAT="$HERE/categories"

# 目标 opencode skills 目录（第二个参数或默认用户级）
TARGET="${2:-$HOME/.config/opencode/skills}"
mkdir -p "$TARGET"

# 分类代号 -> 目录名（避免使用关联数组，兼容 macOS 自带 bash 3.2）
cat_dir() {
  case "$1" in
    01) echo "01_文献与提纲" ;;
    02) echo "02_论文写作" ;;
    03) echo "03_论文排版" ;;
    04) echo "04_论文评审" ;;
    *)  echo "" ;;
  esac
}

# 把软链接解析为绝对路径（兼容 macOS 的 readlink 不带 -f）
abs_target() {
  local link="$1" rel base
  rel="$(readlink "$link")"
  case "$rel" in
    /*) echo "$rel" ;;
    *) base="$(cd "$(dirname "$link")" && pwd)"; echo "$base/$rel" ;;
  esac
}

link_cat() {
  local dir="$1" link name abt
  echo ">> 链接分类: $dir -> $TARGET"
  for link in "$CAT/$dir"/*; do
    [ -L "$link" ] && [ -e "$link" ] || continue
    name="$(basename "$link")"
    abt="$(abs_target "$link")"
    ln -sfn "$abt" "$TARGET/$name"
    echo "   + $name"
  done
}

if [ "${1:-}" = "all" ]; then
  for c in 01 02 03 04; do link_cat "$(cat_dir "$c")"; done
elif [ -n "$(cat_dir "${1:-}")" ]; then
  link_cat "$(cat_dir "${1}")"
else
  echo "用法: $0 <01|02|03|04|all> [target_skills_dir]" >&2
  echo "  01=文献与提纲 02=论文写作 03=论文排版 04=论文评审 all=全部" >&2
  exit 1
fi

echo "完成。重启 OpenCode 后生效。"
