#!/usr/bin/env bash
# 生产部署脚本（在 hk3 上执行）：git pull → build → 同步 standalone 产物 → 同步 public/ → 重启 → 健康检查
#
# 用法（在 hk3 上）：
#   cd /root/aitag-site && bash scripts/deploy-hk3.sh              # 拉取 main 并部署
#   SKIP_PULL=1 bash scripts/deploy-hk3.sh                         # 用当前工作区代码部署（不回滚 git）
#
# 为什么需要这个脚本：Next standalone 产物**不含 `public/`**，
# 2026-09-13 就因为部署时只拷了 `public/fonts`、漏了新增的 `public/studio`，
# 导致生图台 iframe 请求 `/studio/index.html` 404、用户点进去看到 404 页。
# 本脚本按「repo public 顶层条目」整体同步（跳过 images），并在最后逐项校验，
# 新增 public 子目录不会再被静默漏掉。
#
# 红线：绝不覆盖 data/（数据库 + 落盘密钥）与 public/images/（用户图片）。
set -euo pipefail

REPO="${REPO:-/root/aitag-site}"
DEPLOY="${DEPLOY:-/root/aitag-deploy}"
SERVICE="${SERVICE:-aitag-site}"
PORT="${PORT:-3101}"
SKIP_PULL="${SKIP_PULL:-0}"

log()  { printf '\033[36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[deploy]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[deploy:ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 0. 前置检查 ----------
[[ -d "$REPO/.git" ]] || die "源码目录不存在：$REPO"
[[ -d "$DEPLOY" ]] || die "部署目录不存在：$DEPLOY"
[[ -f "$DEPLOY/data/aitag.db" ]] || warn "部署目录里没有 data/aitag.db，确认这是不是生产目录？"

# 记录脚本自身指纹：本脚本做 git pull，而 pull 可能把它自己更新掉。
# bash 在启动时就把脚本读进来了，文件被换掉不会影响正在跑的这一次 ——
# 结果是「新加的部署步骤静默不执行」（2026-09-14 词库同步就这么漏过一次：
# 脚本里明明写了拷贝 data/taglib.db，跑完线上却没有，因为跑的仍是旧逻辑）。
# 下面在第 1 步之后比对指纹，变了就用新版本重新执行。
SELF="${BASH_SOURCE[0]}"
self_sum() {
  if command -v md5sum >/dev/null 2>&1; then
    md5sum "$1" | awk '{print $1}'
  else
    cksum "$1" | awk '{print $1 "_" $2}'
  fi
}
SELF_SUM_BEFORE="$(self_sum "$SELF")"

# ---------- 1. 拉取代码 ----------
cd "$REPO"
if [[ "$SKIP_PULL" == "1" ]]; then
  warn "SKIP_PULL=1：跳过 git pull，使用当前工作区代码"
else
  if [[ -n "$(git status --porcelain)" ]]; then
    die "工作区有未提交改动，先提交或 stash（或用 SKIP_PULL=1）"
  fi
  log "git pull --ff-only origin main"
  git pull --ff-only origin main   # hk3 直连 GitHub，不要带 clash 代理
fi
COMMIT="$(git rev-parse --short HEAD)"
log "部署提交：$COMMIT  $(git log -1 --pretty=%s)"

# 脚本自身被本次 pull 更新了？→ 用新版本重跑，别拿旧逻辑部署。
# DEPLOY_REEXEC 防重入（新版本再跑一次时不会再触发）。
if [[ "$(self_sum "$SELF")" != "$SELF_SUM_BEFORE" && "${DEPLOY_REEXEC:-0}" != "1" ]]; then
  warn "部署脚本自身在本次 pull 中被更新 → 改用新版本重新执行（否则新加的步骤会静默不生效）"
  export DEPLOY_REEXEC=1
  exec bash "$SELF" "$@"
fi

# ---------- 2. 构建 ----------
log "next build（服务器内存小，必须限堆）"
NODE_OPTIONS="--max-old-space-size=1024" npx next build
[[ -f .next/standalone/server.js ]] || die "构建产物缺失：.next/standalone/server.js（output: standalone 配置被改了？）"

# ---------- 3. 同步 standalone 产物 ----------
# ⚠️ node_modules 必须整目录拷贝，增量拷贝会破坏 sharp 等原生模块
log "同步 .next / server.js / node_modules / static"
rm -rf "$DEPLOY/.next" "$DEPLOY/node_modules"
cp -r .next/standalone/.next "$DEPLOY/.next"
cp .next/standalone/server.js "$DEPLOY/server.js"
cp -r .next/standalone/node_modules "$DEPLOY/node_modules"
mkdir -p "$DEPLOY/.next/static"
cp -r .next/static/. "$DEPLOY/.next/static/"

# ---------- 4. 同步 public/（standalone 不含它，漏一个目录就 404） ----------
log "同步 public/（跳过 images，保留线上用户图片）"
mkdir -p "$DEPLOY/public"
if command -v rsync >/dev/null 2>&1; then
  # --delete 只在单个子目录内生效，images 被排除，绝不会被动到
  for src in public/*; do
    [[ -e "$src" ]] || continue
    base="$(basename "$src")"
    [[ "$base" == "images" ]] && continue
    if [[ -d "$src" ]]; then
      rsync -a --delete "$src/" "$DEPLOY/public/$base/"
    else
      cp -f "$src" "$DEPLOY/public/$base"
    fi
  done
else
  warn "没装 rsync，退化为 cp（目录内已删除的旧文件不会被清理）"
  for src in public/*; do
    [[ -e "$src" ]] || continue
    base="$(basename "$src")"
    [[ "$base" == "images" ]] && continue
    cp -r "$src" "$DEPLOY/public/"
  done
fi

# 运维脚本（standalone 不带 scripts/）
mkdir -p "$DEPLOY/scripts"
[[ -f scripts/recalc-metadata.mjs ]] && cp scripts/recalc-metadata.mjs "$DEPLOY/scripts/" || true

# ---------- 4b. 同步中文词库产物（不进 git，必须单独拷） ----------
# data/taglib.db 由 `node scripts/taglib-import.mjs` 从 WeiLin 词库（GPL-3.0）生成，
# data/ 整体在 .gitignore 里，所以它**不会随 git pull 到达**，漏拷会让面板静默退回起始库。
# ⚠️ 只碰 taglib.db 这一个文件：同目录的 aitag.db 与 studio.secret 是生产数据，绝不覆盖。
if [[ -f data/taglib.db ]]; then
  mkdir -p "$DEPLOY/data"
  cp -f data/taglib.db "$DEPLOY/data/taglib.db.new"
  mv -f "$DEPLOY/data/taglib.db.new" "$DEPLOY/data/taglib.db"   # 原子替换，避免服务读到半个文件
  log "同步词库 data/taglib.db（$(du -h data/taglib.db | cut -f1)）"
else
  warn "本地没有 data/taglib.db（词库未同步）→ 线上会回退到 public/studio/tags.default.json"
fi

# ---------- 5. 重启服务 ----------
log "systemctl restart $SERVICE"
systemctl restart "$SERVICE"
for _ in $(seq 1 20); do
  systemctl is-active --quiet "$SERVICE" && break
  sleep 0.5
done
systemctl is-active --quiet "$SERVICE" || die "服务未起来，看：journalctl -u $SERVICE -n 50"

# ---------- 6. 健康检查 ----------
fail=0
check() { # check <描述> <url> <期望状态码>
  local desc="$1" url="$2" want="$3" got
  got="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo 000)"
  if [[ "$got" == "$want" ]]; then
    printf '  ✅ %-34s %s\n' "$desc" "$got"
  else
    printf '  ❌ %-34s %s（期望 %s）\n' "$desc" "$got" "$want"
    fail=1
  fi
}

log "健康检查"
sleep 1
check "首页（未登录 307 跳登录）" "http://127.0.0.1:$PORT/" "307"
check "登录页" "http://127.0.0.1:$PORT/login" "200"
check "生图台 iframe 面板" "http://127.0.0.1:$PORT/studio/index.html" "200"
check "词库接口（未登录 401）" "http://127.0.0.1:$PORT/api/studio/tags" "401"

# 词库产物是否真的到位（不在 git 里，最容易漏的一项）
if [[ -f "$DEPLOY/data/taglib.db" ]]; then
  printf '  ✅ %-34s %s\n' "词库 data/taglib.db" "$(du -h "$DEPLOY/data/taglib.db" | cut -f1)"
else
  printf '  ⚠️  %-34s %s\n' "词库 data/taglib.db 缺失" "面板会回退到起始库（功能可用，标签少）"
fi

# public 顶层条目逐个对齐：新增目录漏拷会在这里暴露
missing=()
for src in public/*; do
  [[ -e "$src" ]] || continue
  base="$(basename "$src")"
  [[ "$base" == "images" ]] && continue
  [[ -e "$DEPLOY/public/$base" ]] || missing+=("$base")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "  ❌ public/ 未同步的条目：${missing[*]}"
  fail=1
else
  printf '  ✅ %-34s %s\n' "public/ 条目齐全" "$(ls "$DEPLOY/public" | tr '\n' ' ')"
fi

[[ "$fail" == "0" ]] || die "健康检查未通过，检查上面的 ❌；回滚：cd $REPO && git reset --hard <上一个提交> && SKIP_PULL=1 bash scripts/deploy-hk3.sh"

log "部署完成 ✅  提交 $COMMIT  服务 $SERVICE 正常"
log "外网确认：curl -s -o /dev/null -w '%{http_code}\\n' https://juocho.kdns.fr/login   # 期望 200"
