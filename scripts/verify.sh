#!/bin/sh
# verify 一次性服务入口：等待应用健康 -> 代码测试 -> 前端构建 -> 跨末端 API 冒烟。
# 任一步失败即以非零退出码报告（set -e）。
set -eu

BASE_URL="${BASE_URL:-http://app:3000}"
export BASE_URL

echo "==> 等待应用健康 (${BASE_URL}/healthz)"
i=0
while [ "$i" -lt 60 ]; do
  if node scripts/healthcheck.js; then
    echo "==> 应用已健康"
    break
  fi
  i=$((i + 1))
  if [ "$i" -eq 60 ]; then
    echo "==> 等待应用健康超时" >&2
    exit 1
  fi
  sleep 1
done

echo "==> 代码测试 (node --test)"
npm test

echo "==> 前端构建 (esbuild)"
npm run build

echo "==> 跨末端片段 API 冒烟"
node scripts/smoke.js

echo "==> verify 全部通过"
