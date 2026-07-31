# YouTube Music Party — Extension

MV3 browser extension that connects [YouTube Music](https://music.youtube.com) to the Telegram Music Party backend over Socket.IO.

## What it does

| Piece | Role |
|--------|------|
| **Popup** | Session control center: join room, connection status, now playing, queue, play/pause/next/volume, leave room, settings, update check |
| **content.js** (MAIN) | Socket.IO client and YT Music DOM control |
| **content-bridge.js** (ISOLATED) | Bridges `chrome.runtime` ↔ MAIN via `window.postMessage` |

Join is available from the popup. It saves the selected room ID and party URL on the YouTube Music page.

**One device per room** (enforced by the backend). A second join replaces the first.

## Popup Join & Default Host

Open a YouTube Music tab, then open the extension popup. If the tab is not joined, the popup shows a join form for the Telegram room ID and party host URL. Submitting joins through the popup bridge, saves `roomId` and `partyUrl` on `music.youtube.com`, and reloads the tab so the content script connects to the backend.

Use the popup settings button to edit the default party host. The value is stored extension-wide in `chrome.storage.local`, falls back to `http://localhost:3000` when unset, and prefills the popup join form. Changing the default host does not leave or reconnect an active room until you join with a new host.

## Develop

```bash
# from repo root
pnpm --filter=extension dev      # Vite HMR for popup only
pnpm --filter=extension build    # production dist/
pnpm --filter=extension test
pnpm --filter=extension lint
```

Load unpacked: Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → `apps/extension/dist`.

After code changes that touch content scripts, rebuild and reload the extension, then refresh the YouTube Music tab.

## Build outputs

```
dist/
  index.html
  main.js
  content.js           # MAIN world
  content-bridge.js    # ISOLATED world
  manifest.json
  assets/
```

Build pipeline (`package.json`):

```bash
tsc -b \
  && vite build \
  && vite build --config vite.config.lib.ts \
  && vite build --config vite.config.bridge.ts
```

Popup Vite uses `base: "./"` so asset paths work under `chrome-extension://`.

## Messaging

Shared types: `src/shared/messages.ts`.

- Popup → tab: `GET_STATUS` | `CONTROL` | `JOIN` | `LEAVE` | `SET_CONTINUE_WATCHING_BYPASS`
- MAIN → popup (via bridge): `STATUS` replies and unsolicited `STATUS_PUSH` on socket/DOM events

## Config storage

On `music.youtube.com` page `localStorage`:

- `roomId`
- `partyUrl`
- `ytmp_device_id` (stable device fingerprint)

Extension-wide `chrome.storage.local`:

- `defaultPartyUrl` (default join host; fallback: `http://localhost:3000`)

## Updates

Popup checks GitHub Releases (`src/lib/update.ts`). Unpacked extensions cannot self-install; the UI walks through download ZIP → extract → reload on `chrome://extensions`.

## Stack

React 19, Vite 6, Tailwind 3, HeroUI, socket.io-client, TypeScript.
