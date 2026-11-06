# YouTube Music Party — Extension

MV3 browser extension that connects [YouTube Music](https://music.youtube.com) to the Telegram Music Party backend over Socket.IO.

## Install

[Install YouTube Music Party from the Chrome Web Store](https://chromewebstore.google.com/detail/youtube-music-party/pdibhcofofkfblpajpjcpopbbbbbncbk).
Chrome installs updates automatically. For setup instructions, visit [ytparty.my.id/support](https://ytparty.my.id/support).

## What it does

| Piece | Role |
|--------|------|
| **Popup** | Join rooms, connection status, now playing, queue, play/pause/next/volume, leave room, current version |
| **content.js** (MAIN) | Socket.IO client, YT Music DOM control, sidebar Join/Leave |
| **content-bridge.js** (ISOLATED) | Bridges `chrome.runtime` ↔ MAIN via `window.postMessage` |

Join from the popup with a Room ID from Telegram `/register`. The advanced field supports a custom HTTP(S) party server, including local development URLs. Joining saves configuration and refreshes the selected YouTube Music tab, which may briefly interrupt playback. Joining continues if the popup closes; reopen it to see the resulting session. The YT Music left sidebar prompts remain available too.

**One device per room** (enforced by the backend). If another device owns the room, the join is rejected as room busy. Leave on that device before retrying. Leave the current room before configuring another while connected.

## Join and connection recovery

- **No tab:** click **Open YouTube Music**, wait for the tab to load, then reopen the popup to join.
- **Bridge unavailable:** reload the music tab, then choose **Retry connection**. Existing tabs may need a refresh after installing or updating the extension.
- **Room busy:** leave on the device that currently owns the room, then choose **Retry join**. This retries the saved session without changing its configuration.
- **Server unreachable:** check the network and party server URL. When not admitted, edit the room/server form and choose **Join Room** to save a corrected configuration and refresh the tab.
- **Admission not confirmed:** after 30 seconds, check the room ID from `/register` and the server URL, then retry or edit the configuration. A timeout does not establish whether the room exists.

With multiple music tabs open, activate the desired tab before opening the popup. The popup selects that tab (or an available music tab if none is active) and ignores status pushes from the others. Unsaved edits stay intact while status updates arrive; saved/current configuration is restored when reopening the popup.

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

- Popup → tab: `GET_STATUS` | `CONTROL` | `LEAVE` | `JOIN` (saved-session retry) | `JOIN_ROOM` (`roomId`, `partyUrl`) | `SET_CONTINUE_WATCHING_BYPASS`
- MAIN → popup (via bridge): `STATUS` replies and unsolicited `STATUS_PUSH` on socket/DOM events
- `JOIN_ROOM` acknowledgement means configuration accepted, not admission. The page acknowledges before scheduling its reload; the popup retries bridge readiness at most eight times, then relies on status pushes from the selected tab. Admission waiting is bounded to 30 seconds and offers retry/edit recovery without assuming that an unconfirmed room does not exist.

## Config storage

On `music.youtube.com` page `localStorage`:

- `roomId`
- `partyUrl` (default prompt: `https://music.ytparty.my.id`; custom server URLs remain supported, and existing saved URLs are preserved)
- `ytmp_device_id` (stable device fingerprint)

## Updates

Chrome Web Store installations update automatically through Chrome. The popup displays the installed version; it does not check GitHub Releases or download updates.

For local development with an unpacked extension, rebuild and reload it on `chrome://extensions`, then refresh the YouTube Music tab.

## Stack

React 19, Vite 6, Tailwind 3, HeroUI, socket.io-client, TypeScript.
