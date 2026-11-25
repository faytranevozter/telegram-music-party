# Web room API (Stage 3)

## Browser client (Stage 4)

Use a disposable backend for local testing. Set `WEB_PUBLIC_ORIGIN=http://127.0.0.1:8787` on that backend (for example running at `http://127.0.0.1:3033`) and configure its web feature flag and secret. From the repository root:

```sh
VITE_PARTY_API_ORIGIN=http://127.0.0.1:3033 pnpm --filter=web build
pnpm --filter=web exec vite preview --host 127.0.0.1 --port 8787 --strictPort
```

Open `http://127.0.0.1:8787/` or use a local invite link from the bot (`/#<code>`). The client does not default to the production API. For production, build with `VITE_PARTY_API_ORIGIN=https://music.ytparty.my.id` and serve `apps/web/dist` at `/` on a dedicated HTTPS origin. Set the backend's `WEB_PUBLIC_ORIGIN` to that exact origin for invites, CORS and observer connections. Publish the updated legal pages separately and enable web rooms only after launch approval. Previously issued `/room#…` URLs need to be replaced with fresh links; existing invite codes still work at the new root.

Web rooms are disabled by default. Enable with `WEB_ROOMS_ENABLED=true`, set
`WEB_PUBLIC_ORIGIN` to the exact client origin, and supply a random base64url
`WEB_SESSION_SECRET` of at least 32 bytes. Use one backend instance for player
admission, live observations, queue serialization, and vote decisions. Redis
is required. Enable publicly only after the Stage 4 client is available.

Telegram room admins can enable, resend, rotate or disable an invite in
`/config`. The bot delivers the link privately. Keep the invite in the URL
fragment and submit its code in the request body; don't log invite codes,
bearer tokens or owner setup details. Guest tokens expire after 24 hours and
are revoked on invite rotation or disablement. Web-only owner tokens last 30
days, survive invite rotation and cannot be recovered if lost. Existing rooms
have web access off until explicitly enabled.

All paths below are under `/api/web/v1`. The room is derived from the bearer
token for all `/room` endpoints. Browser HTTP and observer connections accept
only the configured origin. HTTP tools without an Origin header can use the API.

| Method/path | Body or purpose |
|---|---|
| `POST /rooms/join` | `{shareCode, nickname}` → token, expiry (epoch ms), room name |
| `POST /rooms` | `{name, nickname}` → owner session plus invite code and extension room ID |
| `GET /room` | Room name, role, queue, current track, player availability and capabilities |
| `GET /room/autoplay` | Read-only preview of up to five upcoming non-requested player tracks; `{status: 'ok', tracks: [{videoId, title, artist}]}` or `{status: 'offline' \| 'unavailable' \| 'timeout'}`. Hosts and guests can read it; 20 reads per actor per minute. |
| `GET /room/setup` | Owner-only extension room ID and current invite code |
| `GET /room/settings` | Web-only owner: current queue and search settings |
| `POST /room/settings` | Web-only owner: nonempty partial settings object; returns all settings |
| `POST /room/search` | `{query, type?}`; returns display metadata and a five-minute room/actor-scoped `selectionId` |
| `POST /room/requests` | `{selectionId, position}` (`end` or `next`) |
| `POST /room/votes/next` | `{}` |
| `POST /room/control` | `{action}`: play, pause, next, previous, radio, refresh, mute, unmute, volume-up, volume-down |
| `POST /room/invite` | Web-only owner: `{mode}` (`enable`, `rotate`, `disable`) → `{url}` |

Expect `400` for invalid bodies, `401` for invalid or revoked sessions, `403`
for disallowed actions, `404` for missing invites or selections, `409` for
state conflicts, and `429` for rate limits. Limits per minute: 10 room entries
per direct peer IP (forwarded headers are ignored), 20 searches per actor, and
30 mutations per actor. When requests share a reverse-proxy peer, they share
its entry limit until a trusted proxy policy is configured.

Settings are `maxQueueSize` and `minimumVotes` (integers from 1 through
2,147,483,647), `dailyPlayNextLimit` (integer from 0 through 2,147,483,647;
0 means unlimited), and the boolean fields `playNextCommand` and
`allowVideoSearch`. Unknown fields and invalid values are rejected without
applying any changes. Guests cannot read or edit this settings object. A
successful update publishes fresh room snapshots so connected guests receive
updated capabilities. Telegram room settings remain managed through `/config`.

Web-room hosts can also set `guestRequestLimit` (0–100 tracks, default 0 for
unlimited) and `guestRequestPeriodMinutes` (1–1440, default 10). The rolling
allowance is per authenticated invite session and applies to accepted Queue and
Play Next requests combined. Hosts are exempt, fresh invite sessions start with
a fresh allowance, and Play Next's separate daily limit still applies. An
exhausted guest allowance returns HTTP `429` with
`{status: 'guest-request-limit', retryAt}` (`retryAt` in epoch milliseconds).

Connect to Socket.IO namespace `/web-room` with `auth.token` and the configured
Origin. It emits full `room:state` snapshots, including an initial state after
connection. It does not accept player commands or occupy the existing player
slot. Reconnect for a fresh state. A disconnected player clears the current
track rather than restoring historical playback. Revoked observer sessions
are disconnected.

For automated verification, generate the matching Prisma client, apply
migrations to a disposable PostgreSQL or SQLite database, and run
`pnpm --filter=backend test:e2e --runInBand` with `WEB_ROOM_E2E=true`, web
rooms enabled, and disposable `DATABASE_URL` and `REDIS_URL`. The test uses a
stub song provider and a simulated player; it does not contact Telegram or
YouTube Music.
