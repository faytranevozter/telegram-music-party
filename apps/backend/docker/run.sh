#!/bin/sh
set -eu

echo "🚀 Container starting..."

echo "📦 Running Prisma migrations..."
npx prisma migrate deploy
echo "✅ Migration complete"

echo "▶️ Starting Node app..."
node dist/main.js &
APP_PID=$!

# Forward termination signals to Node
trap 'echo "⚠️ SIGTERM received, shutting down..."; kill -TERM $APP_PID' TERM INT

# Wait for Node process
wait $APP_PID
