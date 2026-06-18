#!/usr/bin/env bash
# 安全部署脚本:停服 → 清旧构建产物 → 干净构建 → 启动。
# 解决反复出现的 .next 损坏(ChunkLoadError / 整站 "This page couldn't load")。
# 用法:  cd /home/app/pod-ai && git pull && bash deploy.sh
set -euo pipefail

cd /home/app/pod-ai

echo "==> [1/4] 停止服务(避免构建和运行中的服务抢 .next)"
systemctl stop pod-ai

echo "==> [2/4] 清理旧构建产物 .next"
rm -rf .next

echo "==> [3/4] 构建(限 4G 内存 / 1.5 核,不影响 WMS)"
systemd-run --scope -p MemoryMax=4G -p CPUQuota=150% npm run build

echo "==> [4/4] 启动服务"
systemctl start pod-ai
sleep 2
systemctl status pod-ai --no-pager | head -5

echo ""
echo "✅ 部署完成。浏览器记得 Ctrl+Shift+R 强刷。"
