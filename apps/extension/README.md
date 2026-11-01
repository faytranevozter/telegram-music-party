# YouTube Music Party — Extension

MV3 browser extension that connects [YouTube Music](https://music.youtube.com) to the Telegram Music Party backend over Socket.IO.

## Install

[Install YouTube Music Party from the Chrome Web Store](https://chromewebstore.google.com/detail/youtube-music-party/pdibhcofofkfblpajpjcpopbbbbbncbk).
Chrome installs updates automatically. For setup instructions, visit [ytparty.my.id/support](https://ytparty.my.id/support).

## What it does

| Piece | Role |
|--------|------|
| **Popup** | Session control center: connection status, now playing, queue, play/pause/next/volume, leave room, current version |
| **content.js** (MAIN) | Socket.IO client, YT Music DOM control, sidebar Join/Leave |
| **content-bridge.js** (ISOLATED) | Bridges `chrome.runtime` ↔ MAIN via `window.postMessage` |

Join is only on the YT Music left sidebar (prompts for Room ID + party URL). The popup does not join rooms; it observes and controls an already-joined tab.

**One device per room** (enforced by the backend). A second join replaces the first.

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

- Popup → tab: `GET_STATUS` | `CONTROL` | `LEAVE`
- MAIN → popup (via bridge): `STATUS` replies and unsolicited `STATUS_PUSH` on socket/DOM events

## Config storage

On `music.youtube.com` page `localStorage`:

- `roomId`
- `partyUrl` (default prompt: `http://localhost:3000`)
- `ytmp_device_id` (stable device fingerprint)

## Updates

Chrome Web Store installations update automatically through Chrome. The popup displays the installed version; it does not check GitHub Releases or download updates.

For local development with an unpacked extension, rebuild and reload it on `chrome://extensions`, then refresh the YouTube Music tab.

## Stack

React 19, Vite 6, Tailwind 3, HeroUI, socket.io-client, TypeScript.
