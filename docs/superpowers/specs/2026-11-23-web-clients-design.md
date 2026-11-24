# Web clients for music party rooms

Status: draft for approval
Date: 2026-11-23

## Intent

Today a room can only be created and controlled through Telegram. People who
are not in the Telegram group cannot request songs, vote, or see the queue.
The goal is to let anyone with a room link take part from a browser, in the
same room and the same queue as the Telegram group.

The Telegram bot stays a first-class client. The web app is a second client of
the same room, not a replacement and not a separate product.

## Goals

- A guest opens a room link in a browser, picks a nickname, and can search,
  request songs, vote, and see the queue and now-playing state live.
- A Telegram chat and web guests share one room, one queue, one vote count and
  one playback device.
- A room can also exist with no Telegram chat at all (web-only room), created
  from the web.
- The Telegram bot behaves exactly as it does today after every stage.

## Non-goals

- User accounts, email or Google sign-in, or "log in with Telegram" on the web.
  Linking a web identity to a Telegram identity is a possible later step.
- Playing audio in the web app. Playback stays in the single extension device
  per room.
- Changing the extension protocol (`join`, `join-rejected`, `playback-report`,
  the room events). The extension is not modified.
- A native mobile app.
- Web versions of the analytics commands (`/stats`, `/top`, `/history`,
  `/mystats`). They keep working for Telegram, and web requests are recorded in
  the same analytics tables.

## Anti-goals

These would make the work a failure even if it appears to work:

- A regression in the live Telegram bot, including `/config`, voting, play-next
  quotas and the stats commands.
- A web guest gaining admin-only actions in a Telegram-linked room.
- Existing request history and vote data becoming unreadable or miscounted
  after the identity migration.
- A guest being able to join or control a room that its owner did not open to
  the web.

## Constraints

- pnpm + Turborepo monorepo; new app lives in `apps/web`. Follow `AGENTS.md`:
  4-space indent, Prettier single quotes and trailing commas in the backend.
- Both database providers must keep working. Every schema change needs a
  PostgreSQL migration and a SQLite migration, `db:sync` / `db:check` parity,
  and a regenerated client.
- `PlaybackService` currently injects the Telegraf bot, and the Telegram
  controllers (`playback.controller.ts`, about 2,700 lines, and
  `playback.stats.controller.ts`) hold both Telegram handling and business
  rules. The business rules must move out before a web client can reuse them.
- Existing specs (gateway, service, search controller, stats controller,
  analytics) are the safety net for stage 1 and must pass unchanged in
  behavior.
- Redis (Keyv) is required at runtime and already holds per-user counters such
  as play-next usage. Those keys are keyed by Telegram user ID today.
- Production is live (`music.ytparty.my.id`). Migrations run at container
  start with `prisma migrate deploy`, so they must be safe on existing data.

## Approaches considered

1. **One large change.** Extract the core, change the schema, add the API and
   build the web app together. Fastest on paper, but the bot is live and a
   regression in the extraction would surface only at the end. Rejected.
2. **Four shippable stages.** Chosen. The bot keeps working after each stage
   and the web app starts only after the core is proven. Costs more total time.
3. **Separate web service forwarding to the bot code.** Duplicates logic and
   still needs the core extracted. Rejected.

Identity options for web users: guest link (chosen), Telegram Login on web
(does not reach people without Telegram), own accounts (adds a login system,
storage, and privacy/terms changes). The user chose the guest link.

## Decisions made with the user

- Web and Telegram control the same room at the same time.
- Four stages, in this order.
- Web users are anonymous guests: they open a link, choose a nickname, and
  receive a signed guest token kept in the browser.
- Telegram admins remain admins. Guests are never admins in a Telegram-linked
  room. Admin-only features (`nextOnlyAdmin`, `radioOnlyAdmin`,
  `refreshOnlyAdmin`, `previousOnlyAdmin`) stay admin-only for web guests
  unless a Telegram admin turns the "only admin" switch off, which then
  applies to everyone.
- A web-only room has an owner. The creator holds an owner token and acts as
  its admin.
- Stack for the web app: React, Vite, Tailwind, HeroUI, to match the
  extension.

## Stages

### Stage 1: neutral core

Move queue, vote, play-next quota and permission logic out of the Telegram
controllers into services that take a plain actor and return plain results.

- Actor shape: `{ userRef: string, displayName: string, isAdmin: boolean,
  source: 'telegram' | 'web' }`.
- Services must not import Telegraf types or build Telegram HTML. Message
  formatting stays in the Telegram layer.
- `PlaybackService` uses the injected Telegraf bot only in `sendMessage` and
  `sendPlaybackNotification`. Move those two methods into the Telegram layer
  and remove the bot from `PlaybackService`. The gateway calls
  `sendPlaybackNotification` for `playback-notification` events, so it must
  skip the call for rooms with no `chatId` (web-only rooms).
- The Telegram controllers become thin: parse the command, build the actor,
  call the service, format the reply.

Done when: all existing specs pass, new unit tests cover the extracted
services, and a manual run of the main bot commands behaves as before.

### Stage 2: schema and identity

- Make `Room.chatId` optional. Keep the `[chatId, threadId]` uniqueness for
  Telegram-linked rooms and make sure nullable values do not collide.
- Introduce a prefixed user reference (`telegram:123`, `web:<id>`) for
  `SongRequest.requesterId` and `Vote.userId`, and for the Redis counter keys.
  Backfill existing rows as `telegram:<old id>`.
- Add a nullable, unique `shareCode` column on `Room`. A null code means the
  room has no web access, so a separate on/off switch is not needed.
- Add owner information for web-only rooms.
- Ship PostgreSQL and SQLite migrations, verified against a copy of
  production-shaped data.

Done when: migrations apply on both providers, existing stats commands return
the same numbers as before the migration, and the bot still works.

### Stage 3: HTTP API and guest auth

- Guest sign-in endpoint: nickname in, signed token out. Token carries the
  guest ID and nickname.
- Room endpoints: resolve a room by share code (the room ID is never accepted
  or returned to web clients), create a web-only room, read room state
  (now playing, queue, feature flags), search, request a song, play next,
  vote, and the controls that are enabled for the actor.
- Every endpoint builds the actor and calls the stage 1 services, so limits,
  quotas, queue size and admin rules are enforced in one place.
- Add a web-client channel to the Socket.IO gateway so the browser receives
  queue and now-playing updates live. The extension's `join` flow and events
  are untouched, and web clients cannot occupy the room's device slot.
- Input validation at the boundary, rate limiting on guest creation and
  search, and CORS restricted to the web app origin.

Done when: an API client (and tests) can run a full guest flow against a room
that also has a Telegram chat, and the same limits apply as in Telegram.

### Stage 4: `apps/web`

- Room page: nickname prompt, search, queue, now playing, vote, and the
  controls available to the actor.
- Create-room flow for web-only rooms.
- Served by the backend (`ServeStaticModule` already exists) or by the
  existing Cloudflare Worker setup; the builder picks, see below.
- A way for a Telegram room to produce its web link (for example in `/info`
  or a dedicated command) and for a Telegram admin to enable web access,
  disable it, and regenerate the share code, from `/config`.

Done when: a guest on a phone can join a Telegram-linked room by link, request
a song, and see it play through the extension, with the Telegram group seeing
the same queue.

## My calls (not yet confirmed by the user)

- **Web access is off by default for Telegram-linked rooms.** A Telegram admin
  enables it with a switch in `/config`. Reason: existing groups never agreed
  to open their room to outsiders, and a leaked link should not grant access.
  Web-only rooms are open to anyone with the link.
- **Web links use a separate random share code, not the room ID.** `/register`
  builds room IDs with `getRandomHumanReadable` (an adjective plus two nouns),
  which is easy to guess and is pasted into the extension and shared in
  screenshots. The code is stored on the room and goes in the web link. The
  extension keeps using the room ID, so it is not modified. The code is
  created when a Telegram admin turns on web access in `/config`, or when a
  web-only room is created. Turning web access off or regenerating the code
  invalidates old links.
- **Existing stats keep Telegram semantics.** Web guests appear in analytics
  as `web:<id>` with their nickname snapshot, but `/mystats` is Telegram-only.
- **Guest tokens are signed, not stored**, with a secret from the environment.
  Per-user limits such as `dailyPlayNextLimit` therefore apply per token. A
  guest who clears their browser gets a fresh identity. This is accepted for
  the guest model, and the per-room limits (`maxQueueSize`, `minimumVotes`)
  remain the main protection.

## Left to the builder

- Exact endpoint paths, payload shapes, and token lifetime.
- Whether the web app is served by the backend or by the Worker, and how that
  fits the CORS and URL setup.
- Module layout for the neutral services.
- How to model the owner of a web-only room.
- Share code length and format.
- Test strategy for the web app.
- Documentation updates (`AGENTS.md`, `docs/`, privacy and terms for the
  guest nickname and token).
