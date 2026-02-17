FROM node:23-alpine AS deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && apk add --no-cache openssl

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/

# Install all dependencies (needed for build)
RUN pnpm install --frozen-lockfile

FROM deps AS build

WORKDIR /app

# Copy source code
COPY . .

# Generate Prisma Client and build
RUN pnpm --filter=backend prisma generate --schema=./apps/backend/prisma/schema.prisma && \
    pnpm --filter=backend build

FROM node:23-alpine AS prod-deps

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && apk add --no-cache openssl

WORKDIR /app

# Copy entire workspace for pnpm deploy
COPY . .

# Deploy backend with production dependencies using legacy mode
RUN pnpm --filter=backend deploy --legacy pruned --prod

FROM node:23-alpine AS runtime

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && apk add --no-cache openssl
ENV NODE_ENV=production

WORKDIR /app

# Copy production dependencies and app from pruned directory
COPY --from=prod-deps /app/pruned ./

# Copy built application
COPY --from=build /app/apps/backend/dist ./dist

# Copy runtime files
COPY apps/backend/public ./public
COPY apps/backend/docker ./docker
COPY apps/backend/prisma ./prisma

# Generate Prisma Client for production
RUN pnpm prisma generate --schema=./prisma/schema.prisma

RUN chmod +x ./docker/run.sh

ENTRYPOINT ["./docker/run.sh"]