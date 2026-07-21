#!/bin/sh
set -eu

echo "🚀 Container starting..."

echo "📦 Running Prisma migrations..."
if [ -x "./node_modules/.bin/prisma" ]; then
    ./node_modules/.bin/prisma migrate deploy
elif [ -f "./node_modules/prisma/build/index.js" ]; then
    node ./node_modules/prisma/build/index.js migrate deploy
else
    echo "❌ prisma CLI not found in node_modules"
    exit 1
fi
echo "✅ Migration complete"

echo "▶️ Starting Node app..."
exec node dist/main.js
