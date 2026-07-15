# AGENTS.md

## Overview

pnpm monorepo (Turborepo) for a Telegram music party bot. Users control YouTube Music playback in a Telegram group via bot commands; a browser extension connects to YT Music and receives playback commands over Socket.IO.

## Workspace Layout

- `apps/backend` — NestJS API + Telegram bot (nestjs-telegraf) + Socket.IO gateway. Prisma ORM, PostgreSQL, Redis (Keyv cache).
- `apps/extension` — Browser extension (React + Vite, Tailwind, HeroUI). Built twice: once as a popup (`vite.config.ts`) and once as injected content script (`vite.config.lib.ts` → `content.js`).
- `packages/` — currently empty (reserved).

## Commands

All commands run from repo root unless noted. Workspace uses pnpm + Turborepo.

```bash
pnpm install                # install all workspace deps
pnpm dev                    # turbo dev (runs both apps in watch mode)
pnpm build                  # turbo build (builds all apps)

# Backend (run from apps/backend or use --filter)
pnpm --filter=backend dev          # nest start --watch
pnpm --filter=backend build        # nest build
pnpm --filter=backend start:prod   # node dist/main
pnpm --filter=backend test         # jest (unit tests in src/**/*.spec.ts)
pnpm --filter=backend test:e2e     # jest --config ./test/jest-e2e.json
pnpm --filter=backend lint         # eslint --fix
pnpm --filter=backend format       # prettier --write

# Extension (run from apps/extension or use --filter)
pnpm --filter=extension dev        # vite dev server
pnpm --filter=extension build      # tsc -b && vite build && vite build --config vite.config.lib.ts
pnpm --filter=extension lint       # eslint .
```

Run a single backend test file: `pnpm --filter=backend test -- <path-or-pattern>` (e.g. `pnpm --filter=backend test -- app.controller.spec.ts`).

## Prisma

- Schema: `apps/backend/prisma/schema.prisma` — PostgreSQL datasource.
- Migrations live in `apps/backend/prisma/migrations/`.
- **Always run `pnpm --filter=backend prisma generate` after changing the schema or pulling changes.** The generated client is not committed.
- Create a migration: `pnpm --filter=backend prisma migrate dev --name <name>` (from `apps/backend`).
- In Docker, `prisma migrate deploy` runs at container start (`apps/backend/docker/run.sh`).

## Environment Variables

Backend reads from `apps/backend/.env` (gitignored). Required:

- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection string (used by Keyv cache)

See `apps/backend/.env.example`.

## Architecture Notes

- **Backend entrypoint**: `apps/backend/src/main.ts` — bootstraps NestJS, registers Telegram bot commands, listens on port 3000 (or `PORT` env).
- **AppModule** (`src/app.module.ts`): wires CacheModule (Redis/Keyv), ServeStaticModule (serves `public/`), PlaybackModule, and TelegrafModule.
- **PlaybackModule** (`src/app/playback/`): core feature area.
  - `playback.controller.ts` — Telegram bot command handlers (`@Update()` decorator from nestjs-telegraf). All `/play`, `/pause`, `/register`, `/queue`, inline queries, etc.
  - `playback.gateway.ts` — Socket.IO WebSocket gateway. Emits playback commands (`play`, `pause`, `next`, `prev`, `volumeUp`, etc.) to connected browser extension clients in a room.
  - `playback.service.ts` — DB operations (rooms, queues, devices, votes, features).
- **Platform services** (`src/platform/`): `prisma.service.ts` (Prisma client wrapper), `yt-music.service.ts` (searches YouTube Music via `ytmusic-api`).
- **Providers** (`src/providers/`): `keyv.provider.ts` and `redis.provider.ts` — Redis client factories injected via DI tokens `KEYV_CACHE` and `REDIS_CLIENT`.
- **Config** (`src/config/env.ts`): loads `.env` via `dotenv` and exports typed `ENV` object. Access env vars via `ENV.TELEGRAM_BOT_TOKEN` / `ENV.REDIS_URL`.
- **Extension content script** (`src/lib/index.ts`): injected into `music.youtube.com`. Connects to backend via Socket.IO, manipulates the YT Music DOM player, handles `play`/`pause`/`next`/`addToQueue` events. Communication flow: Telegram bot → backend gateway → Socket.IO → extension → YT Music player.

## Code Style

- **Indentation**: 4 spaces (`.editorconfig`). No final newline, no trailing whitespace trim.
- **Backend**: Prettier with `singleQuote: true`, `trailingComma: "all"`. ESLint with type-checked rules (`recommendedTypeChecked`). `no-explicit-any` is OFF; `no-floating-promises` and `no-unsafe-argument` are WARN.
- **Extension**: ESLint flat config, React hooks + refresh plugins. No type-checked rules.
- **TypeScript**: backend uses CommonJS modules, `ES2023` target, `strictNullChecks: true` but `noImplicitAny: false`. Decorators enabled (NestJS).

## Docker

- `apps/backend/Dockerfile` — multi-stage build. Uses `pnpm deploy --legacy` for production deps. Runs `prisma migrate deploy` then `node dist/main.js` on startup.
- Root `Dockerfile` is a simpler legacy build (references `docker/` and `prisma/` at root level — the backend's own Dockerfile is the canonical one).
- `run.sh` at root is a convenience script for running the pre-built Docker image.

## Key Gotchas

- The `@prisma/client` version in `apps/backend/package.json` is `6.5.0` while root has `^6.19.2` — the backend pins to an older version intentionally.
- Extension `.npmrc` hoists `@heroui/*` packages (needed for HeroUI to work with pnpm).
- `pnpm-workspace.yaml` lists `onlyBuiltDependencies` for native build steps (Prisma engines, SWC, esbuild, Biome, NestJS core, HeroUI).
- The extension `build` script runs Vite **twice** — once for the popup HTML and once for the content script library bundle. Both outputs land in `dist/`.
- Redis is required at runtime — the backend will fail to start without a reachable `REDIS_URL`.
- Backend imports use `src/` path alias (e.g. `import { ENV } from 'src/config/env'`), resolved via `baseUrl: "./"` in tsconfig. No path mapping in `tsconfig.json` — the `src/` prefix works because `baseUrl` is set.
