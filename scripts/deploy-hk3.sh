#!/usr/bin/env bash
# 向后兼容转发包装：hk3 已于 2026-11-02 迁往 jp-vps (64.81.114.30)
# 推荐统一执行 scripts/deploy.sh
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$DIR/deploy.sh" "$@"
