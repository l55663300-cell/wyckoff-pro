#!/bin/bash
# Wyckoff Pro 开发服务器启动脚本
# 使用方法：./start.sh

PORT=4200
NODE=/Users/liyunfei/.workbuddy/binaries/node/versions/20.18.0/bin/node
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 检查是否已在运行
if lsof -i :$PORT > /dev/null 2>&1; then
  echo "✅ 服务已在运行: http://localhost:$PORT"
  exit 0
fi

echo "🚀 启动 Wyckoff Pro 开发服务器..."
cd "$PROJECT_DIR"
nohup "$NODE" node_modules/.bin/vite --port $PORT --host > /tmp/wyckoff-vite.log 2>&1 &
echo "PID=$!" > /tmp/wyckoff-vite.pid

sleep 2
ACTUAL_PORT=$(grep -o 'localhost:[0-9]*' /tmp/wyckoff-vite.log | tail -1 | cut -d: -f2)
echo "✅ 服务已启动: http://localhost:${ACTUAL_PORT:-$PORT}"
echo "📋 日志: tail -f /tmp/wyckoff-vite.log"
echo "🛑 停止: kill \$(cat /tmp/wyckoff-vite.pid)"
