# syntax=docker/dockerfile:1

# --- shared base (pnpm + openssl for Prisma) ---
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true
RUN corepack enable \
    && apk add --no-cache openssl libc6-compat

# --- install, build, prune ---
FROM base AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter=backend...

COPY apps/backend ./apps/backend

WORKDIR /app/apps/backend
RUN pnpm exec prisma generate --schema=./prisma/schema.prisma \
    && pnpm exec nest build \
    && find dist -type f \( -name '*.map' -o -name '*.d.ts' -o -name '*.tsbuildinfo' \) -delete

# Portable production tree (prod deps only)
WORKDIR /app
RUN pnpm --filter=backend deploy --legacy --prod /app/pruned

# Generate Prisma for pruned tree, then strip build-only junk
WORKDIR /app/pruned
RUN pnpm exec prisma generate --schema=./prisma/schema.prisma \
    && rm -rf /tmp/* \
    # docs / tests / type packages never needed at runtime
    && find node_modules -type f \( \
         -name '*.md' -o -name 'CHANGELOG*' -o -name 'LICENSE*' -o -name 'README*' -o -name '*.map' -o -name '*.d.ts' \
       \) -delete 2>/dev/null || true \
    && find node_modules -type d \( \
         -name 'docs' -o -name 'examples' -o -name 'example' -o -name 'test' -o -name 'tests' -o -name '__tests__' \
       \) -prune -exec rm -rf {} + 2>/dev/null || true \
    # prisma CLI pulls esbuild + biome; migrate deploy does not need them
    && rm -rf \
         node_modules/.pnpm/@biomejs* \
         node_modules/.pnpm/esbuild@* \
         node_modules/.pnpm/esbuild-register@* \
         node_modules/.pnpm/@esbuild* \
         node_modules/.pnpm/typescript@* \
         node_modules/.pnpm/@types+node@* \
         node_modules/@biomejs \
         node_modules/esbuild \
         node_modules/typescript \
         node_modules/@types \
    2>/dev/null || true \
    # drop duplicate query engines kept under @prisma/engines / prisma CLI
    # (client already has libquery_engine under .prisma/client)
    && find node_modules/.pnpm -path '*/@prisma/engines/*' \( \
         -name 'libquery_engine*' -o -name 'query-engine*' \
       \) -delete 2>/dev/null || true \
    && find node_modules/.pnpm -path '*/prisma@*/node_modules/prisma/libquery_engine*' -delete 2>/dev/null || true

# --- minimal runtime ---
FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl libc6-compat \
    && addgroup -S nodejs \
    && adduser -S nodejs -G nodejs
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=nodejs:nodejs /app/pruned ./
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/dist ./dist
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/prisma ./prisma
COPY --chown=nodejs:nodejs apps/backend/public/index.html ./public/index.html
COPY --chown=nodejs:nodejs apps/backend/docker ./docker

RUN chmod +x ./docker/run.sh

USER nodejs
ENTRYPOINT ["./docker/run.sh"]
