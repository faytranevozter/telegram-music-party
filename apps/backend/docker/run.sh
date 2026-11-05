#!/bin/sh
set -eu

echo "🚀 Container starting..."

echo "📦 Running Prisma migrations..."
node -e 'const { PrismaService } = require("./dist/platform/prisma.service"); const db = new PrismaService(); db.onModuleInit();'
node scripts/database.mjs deploy
echo "✅ Migration complete"

echo "▶️ Starting Node app..."
exec node dist/main.js
