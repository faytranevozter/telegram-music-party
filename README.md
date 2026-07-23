# Telegram Music Party

Control [YouTube Music](https://music.youtube.com) from a Telegram group. The bot queues songs and sends playback commands; a browser extension on YouTube Music receives them over Socket.IO and drives the player.

```
Telegram group  →  NestJS backend  →  Socket.IO  →  Extension on music.youtube.com
     /play, /queue, inline search…                    play / pause / queue / volume…
```

## Features

- Room-based music parties (one active player device per room)
- Inline song search and queue from Telegram
- Playback controls: play, pause, next, prev, volume, mute, lyrics
- Vote-to-skip (`/vote_next`)
- Admin room config via `/config` (queue limits, who can skip, etc.)
- Browser extension popup: session status, now playing, queue, remote controls, update check

## How to use

### 1. Telegram

1. Add [@xmsc_bot](https://t.me/xmsc_bot) to your group (or your self-hosted bot).
2. Run `/register` — the bot replies with a **Room ID**.
3. Keep the group/topic open for queue and status messages.

### 2. Browser extension

1. Install the latest release zip from  
   [GitHub Releases](https://github.com/faytranevozter/telegram-music-party/releases/latest)  
   (`yt-music-party-extension-vX.Y.Z.zip`).
2. Chrome: open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the extracted folder.  
   Firefox: load temporary add-on / install from AMO if published.
3. Open [music.youtube.com](https://music.youtube.com) and sign in.
4. In the left sidebar, click **Join Room**.
5. Paste the Room ID from `/register`.
6. Enter the party server URL (default `http://localhost:3000` for local dev; your production URL otherwise).

Only **one device** can be connected to a room at a time. Joining from another browser replaces the previous device.

### 3. Queue and play

1. In the group, type `@xmsc_bot <song name>` (inline search).
2. Choose **Add to queue** or **Play Next** (if enabled).
3. Run `/play` to start (or control from the extension popup).

### Extension popup

Click the extension icon for:

| State | What you see |
|--------|----------------|
| No YT Music tab | Button to open YouTube Music |
| Not joined | Hint to use **Join Room** in the YT Music sidebar |
| Server offline | “Server unreachable” (room is saved, socket down) |
| Connected | Now playing, transport/volume controls, queue, leave |

The popup can also **check for updates** against GitHub Releases and guide you through reloading the unpacked extension after downloading a new zip.

## Bot commands

| Command | Description |
|---------|-------------|
| `/start` | Instructions |
| `/register` | Link this chat/topic to a party room |
| `/unregister` | Unlink room (admin) |
| `/play` | Play / resume |
| `/pause` | Pause |
| `/next` | Next track |
| `/prev` | Previous track |
| `/vote_next` | Vote to skip |
| `/queue` | Show queue |
| `/lyrics` | Lyrics for current track |
| `/volume_up` / `/volume_down` | Volume |
| `/mute` / `/unmute` | Mute |
| `/info` | Room info (rich table) |
| `/devices` | Connected device(s) |
| `/config` | View & edit room settings (admin) |

## Monorepo layout

```
apps/backend     NestJS + Telegraf bot + Socket.IO + Prisma
apps/extension   Chrome/Firefox MV3 extension (popup + content scripts)
packages/        reserved
```

## Local development

### Requirements

- Node 22+, pnpm 10.6+
- PostgreSQL
- Redis

### Setup

```bash
pnpm install

# Backend env
cp apps/backend/.env.example apps/backend/.env
# Set TELEGRAM_BOT_TOKEN, DATABASE_URL (Postgres), REDIS_URL

pnpm --filter=backend prisma generate
pnpm --filter=backend prisma migrate dev

pnpm dev   # turbo: backend + extension
```

- Backend: `http://localhost:3000`
- Extension: build with `pnpm --filter=extension build`, then load `apps/extension/dist` as unpacked.

### Useful commands

```bash
pnpm --filter=backend dev
pnpm --filter=backend test
pnpm --filter=backend lint

pnpm --filter=extension dev
pnpm --filter=extension build
pnpm --filter=extension test
pnpm --filter=extension lint
```

## Technologies

- NestJS, nestjs-telegraf, Socket.IO
- Prisma + PostgreSQL, Redis (Keyv)
- React, Vite, Tailwind, HeroUI (extension popup)
- YouTube Music DOM control from the content script

## Versioning & release

Semver lives in `VERSION` (source of truth) and is mirrored in root + workspace `package.json` files and `apps/extension/public/manifest.json`.

### Bump

```bash
pnpm version:patch   # 1.5.4 → 1.5.5
pnpm version:minor   # 1.5.4 → 1.6.0
pnpm version:major   # 1.5.4 → 2.0.0
```

Commit the bumped files, then publish:

```bash
git checkout main && git pull
git tag "v$(tr -d '[:space:]' < VERSION)"
git push origin "v$(tr -d '[:space:]' < VERSION)"
```

Pushing a `v*.*.*` tag runs:

1. **Docker Publish** → GHCR backend image  
2. **Extension Release** → builds the browser extension zip and attaches it to the GitHub Release

```
ghcr.io/faytranevozter/telegram-music-party:vX.Y.Z
ghcr.io/faytranevozter/telegram-music-party:latest

# Release asset
yt-music-party-extension-vX.Y.Z.zip
```

## License

See [LICENSE.md](./LICENSE.md).
