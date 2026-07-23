# AGENTS.md

## Overview

pnpm monorepo (Turborepo) for a Telegram music party bot. Users control YouTube Music playback in a Telegram group via bot commands; a browser extension on `music.youtube.com` receives playback commands over Socket.IO.

**One active device per room** — a new `join` kicks other sockets/devices for that room.

## Workspace Layout

- `apps/backend` — NestJS API + Telegram bot (nestjs-telegraf) + Socket.IO gateway. Prisma ORM, PostgreSQL, Redis (Keyv cache).
- `apps/extension` — Browser extension (React + Vite, Tailwind, HeroUI). Built **three** times:
  - Popup (`vite.config.ts` → `index.html` + `main.js`)
  - MAIN content script (`vite.config.lib.ts` → `content.js`)
  - ISOLATED bridge (`vite.config.bridge.ts` → `content-bridge.js`)
- `packages/` — currently empty (reserved).

## Commands

All commands run from repo root unless noted. Workspace uses pnpm + Turborepo.

```bash
pnpm install                # install all workspace deps
pnpm dev                    # turbo dev (runs both apps in watch mode)
pnpm build                  # turbo build (builds all apps)

# Backend
pnpm --filter=backend dev
pnpm --filter=backend build
pnpm --filter=backend start:prod
pnpm --filter=backend test
pnpm --filter=backend test:e2e
pnpm --filter=backend lint
pnpm --filter=backend format

# Extension
pnpm --filter=extension dev
pnpm --filter=extension build   # tsc -b && vite + lib + bridge
pnpm --filter=extension test
pnpm --filter=extension lint
```

Run a single backend test file: `pnpm --filter=backend test -- <path-or-pattern>`.

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

### Backend

- **Entrypoint**: `apps/backend/src/main.ts` — NestJS bootstrap, `setMyCommands`, port 3000 / `PORT`.
- **AppModule**: CacheModule (Redis/Keyv), ServeStaticModule, PlaybackModule, TelegrafModule.
- **PlaybackModule** (`src/app/playback/`):
  - `playback.controller.ts` — Telegram handlers (`@Update()`). Commands: play/pause/next/prev, queue, register, config, info, devices, inline search, etc. **No `/set`** — use `/config`.
  - `playback.gateway.ts` — Socket.IO. On `join`: enforce single device (remove other devices + emit `leave` to other sockets). Emits `play`/`pause`/`next`/`prev`/`volume*`/`mute`/`addToQueue` (with optional `title`)/`leave`.
  - `playback.service.ts` — rooms, queues, devices (`removeOtherDevices`), votes, features.
- **HTML helpers** (`src/helpers/util.ts`): `escapeHtml`, `htmlBold`, `htmlCode`, etc. Never spread a joined string into a message array (`...map().join()` spreads characters and breaks HTML tags).
- **`/info`**: uses Bot API `sendRichMessage` with rich HTML `<table>` (telegraf has no typed helper yet — `callApi('sendRichMessage', …)`).
- **Platform**: `prisma.service.ts`, `yt-music.service.ts` (`ytmusic-api`).
- **Config**: `src/config/env.ts` → `ENV.*`. Path alias `src/` via `baseUrl: "./"`.

### Extension

```
Popup (React) ──chrome.tabs.sendMessage──► content-bridge.js (ISOLATED)
                                              │ window.postMessage
                                              ▼
                                           content.js (MAIN world)
                                              │ Socket.IO
                                              ▼
                                           Backend
```

- **Popup** (`src/App.tsx`): control center — connection state, now playing, queue titles, transport controls, leave, GitHub update check. Not static install docs.
- **MAIN content** (`src/lib/index.ts` + `playback.ts` + `browser.ts`): Socket.IO client, YT Music DOM, sidebar Join/Leave (`prompt` for room ID + party URL → `localStorage`).
- **Bridge** (`src/lib/bridge-main.ts`, `src/lib/bridge-isolated.ts`, `src/shared/messages.ts`): request/response + `STATUS_PUSH` on socket/DOM events (no popup polling).
- **Config**: page `localStorage` keys `roomId`, `partyUrl`, `ytmp_device_id` on `music.youtube.com`.
- **Leave payload**: `{ roomId, fingerprint }` (not `id`).
- **Updates**: `src/lib/update.ts` fetches GitHub latest release; host_permissions include `api.github.com` / `github.com`.
- **Build**: `base: "./"` in popup Vite config so assets work under `chrome-extension://`.

### Flow

Telegram bot → gateway emit → Socket.IO room → extension MAIN → YT Music player.  
Popup → bridge → MAIN for status/controls without going through Telegram.

## Code Style

- **Indentation**: 4 spaces (`.editorconfig`). No final newline, no trailing whitespace trim.
- **Backend**: Prettier `singleQuote: true`, `trailingComma: "all"`. ESLint type-checked; `no-explicit-any` OFF; floating promises / unsafe-argument WARN.
- **Extension**: ESLint flat config, React hooks + refresh. No type-checked rules.
- **TypeScript**: backend CommonJS, `ES2023`, `strictNullChecks: true`, `noImplicitAny: false`, decorators on.

## Docker

- `apps/backend/Dockerfile` — multi-stage; `pnpm deploy --legacy`; `prisma migrate deploy` then `node dist/main.js`.
- Root `Dockerfile` is legacy; prefer backend Dockerfile.
- Root `run.sh` (if present) is a convenience runner for the image.

## Key Gotchas

- `@prisma/client` in backend is pinned `6.5.0` while root may differ — intentional.
- Extension `.npmrc` hoists `@heroui/*` for pnpm + HeroUI.
- `pnpm-workspace.yaml` `onlyBuiltDependencies` for Prisma, SWC, esbuild, Nest, HeroUI, etc.
- Extension build runs Vite **three** times (popup, MAIN content, ISOLATED bridge). Outputs in `dist/`.
- Redis required at runtime.
- MAIN-world content scripts cannot use `chrome.*` — always go through the ISOLATED bridge.
- When building HTML Telegram messages, do not `...string` into arrays; map to full line strings, then `.join('\n')`.
- Default party URL in extension is `http://localhost:3000` — set production URL on Join.
