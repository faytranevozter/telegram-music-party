# Backend — Telegram Music Party

NestJS service that runs the Telegram bot and Socket.IO gateway for YouTube Music Party rooms.

## Responsibilities

- Telegram commands & inline search (`nestjs-telegraf`)
- Room / queue / device / vote / feature persistence (Prisma + PostgreSQL)
- Redis cache (Keyv) for inline song callbacks and config flows
- Socket.IO gateway → browser extension clients

## Setup

```bash
# from repo root
cp apps/backend/.env.example apps/backend/.env
# TELEGRAM_BOT_TOKEN, DATABASE_URL (Postgres), REDIS_URL

pnpm install
pnpm --filter=backend prisma generate
pnpm --filter=backend prisma migrate dev
pnpm --filter=backend dev
```

Default port: `3000` (`PORT` env).

## Scripts

```bash
pnpm --filter=backend dev
pnpm --filter=backend build
pnpm --filter=backend start:prod
pnpm --filter=backend test
pnpm --filter=backend test:e2e
pnpm --filter=backend lint
pnpm --filter=backend format
```

## Layout

```
src/
  main.ts                 bootstrap + bot command menu
  app.module.ts
  app/playback/
    playback.controller.ts   Telegram handlers
    playback.gateway.ts      Socket.IO (join/leave/play/…)
    playback.service.ts      DB access
  platform/               prisma, yt-music search
  helpers/                HTML escape/format, validation
  config/env.ts
prisma/
  schema.prisma
  migrations/
```

## Socket events (extension)

| Client → server | Server → client |
|-----------------|-----------------|
| `join` `{ id, browser, ip, fingerprint }` | `joined` (queue rows with `title`) |
| `leave` `{ roomId, fingerprint }` | `leave` (also used when replaced by another device) |
| `started` `{ roomId, videoId }` | `play` / `pause` / `next` / `prev` |
| `notify` `{ roomId, message }` | `volumeUp` / `volumeDown` / `mute` / `unmute` |
| | `lyrics` / `addToQueue` `{ videoId, position?, title? }` / `resume` |

On `join`, the gateway keeps **only this fingerprint** as the room’s device: other DB devices are removed and other sockets in the room receive `leave`.

## Notable bot behavior

- `/config` — admin UI for room features (replaces removed `/set`).
- `/info` — native rich message table via `sendRichMessage` (Bot API 10.1+).
- `/devices` — HTML list of devices (escape/join carefully; never character-spread strings).
- Inline `@bot query` — search + Add to queue / Play Next.

## Docker

See `apps/backend/Dockerfile` (multi-stage, `prisma migrate deploy` on start). Image published to GHCR on version tags (see root README).
