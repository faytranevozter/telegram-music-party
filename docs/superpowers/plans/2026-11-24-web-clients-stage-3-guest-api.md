# Web Clients, Stage 3: Guest Access and Shared Room API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest with an invite join a room without Telegram and use the same queue, votes, playback policies, and admitted player as the Telegram group.

**Architecture:** Add a room-scoped HTTP adapter over the existing playback core, with signed bearer sessions and revocable invites. Add a separate Socket.IO namespace for browser state; the existing player namespace and extension protocol stay unchanged. Telegram remains an equal client of the same room.

**Tech Stack:** NestJS, Socket.IO, Prisma 6.5.0 (PostgreSQL and SQLite), Keyv/Redis, Node crypto, Jest.

**Spec:** [Web clients design](../specs/2026-11-23-web-clients-design.md), Stages 3–4. Implement Telegram invite controls in Stage 3 so the shared-room milestone can be verified without editing the database by hand.

## Global Constraints

- Existing Telegram rooms are private until an admin enables an invite. Guests are never admins of linked rooms. No Telegram sign-in, email accounts, or browser audio playback.
- Keep the extension protocol and one-player rule unchanged. Browser observers must never take a device slot or receive player-only commands.
- Reuse `QueueRequestService`, `VoteService`, `PlayNextQuotaService`, `authorizeControl`, and existing search. Do not trust client-supplied identity, roles, room feature flags, song metadata, or requester information.
- No browser UI in Stage 3. Browser deployment and legal-page updates must precede public launch in Stage 4. Use disposable storage and a dedicated test bot for smoke tests; no production rollout under this plan.
- No new schema is needed for this stage: `shareCode` is nullable and unique; `ownerUserRef` is already nullable. Room IDs remain unchanged and are not invite credentials.
- With `WEB_ROOMS_ENABLED` off, web HTTP routes return `404`, observer connections are rejected, and Telegram invite controls are hidden. A web API token never authorizes player admission.

## Review Focus

- Rotating or disabling an invite blocks the old link, old guest tokens, and further snapshots on already connected observer sockets; owner access survives rotation. Tasks 1 and 4.
- Guessing another room or sending `isAdmin: true` cannot authorize it. A linked-room guest cannot invoke admin-only controls. Tasks 1 and 3.
- A stale or cross-room search selection never queues; a video-search policy change is enforced again on write. Task 3.
- An observer stays online while the player disconnects; it must see offline state and never receive player commands. Task 4.
- Telegram and guest requests see one queue; concurrent writes cannot exceed the limit by each reading the same count in a single backend process. Task 3.

## File Map

Paths below are relative to `apps/backend/` unless noted.

- `src/app/playback/web/web-session.ts`, `web-room-access.service.ts`, `web-rate-limit.service.ts`: claim signing, room resolution, invite lifecycle, and throttling.
- `src/app/playback/web/web-room.controller.ts`, `web-room.service.ts`, `web-room.types.ts`: HTTP boundary, orchestration, explicit public DTOs.
- `src/app/playback/web/web-room.gateway.ts`, `web-room-state.service.ts`: observer-only snapshots and publication.
- `src/app/playback/playback.controller.ts`, `playback.module.ts`, `playback.gateway.ts`, `core/queue-request.service.ts`, `core/vote.service.ts`: existing adapter integration, provider wiring, shared mutation boundaries and admitted-player state.
- `src/config/env.ts`, `.env.example`, `test/web-room.e2e-spec.ts`, root `docs/web-room-api.md`: configuration, contract tests, and consumer documentation.

### Task 1: Room access and revocable signed sessions

**Interfaces:** `WebSessionClaims = { roomId: string; userRef: string; nickname: string; inviteVersion: string | null; exp: number }`; `WebSession.sign(claims): string`; `WebSession.verify(token: string): WebSessionClaims | null`; `WebRoomAccessService.join(shareCode: string, nickname: string): Promise<SessionResult>`; `create(name: string, nickname: string): Promise<OwnerSessionResult>`; `authenticate(token: string): Promise<{ room: Room; actor: Actor; expiresAt: number }>`; `setInvite(roomId: string, mode: 'enable' | 'rotate' | 'disable'): Promise<string | null>`. `SessionResult = { token: string; expiresAt: number; room: { name: string } }`; owner result adds the share code and extension setup room ID.

- [ ] Write red specs: valid token round-trips; tampered, expired, malformed, or oversized tokens fail. Unknown/disabled old invite is `404`; old guest token after rotation is `401`; a room deletion invalidates all sessions. A forged privileged claim has no effect; a genuine web-only owner stays admin after invite rotation. Two web rooms cannot reuse an invite code; the unique-index conflict is retried with fresh randomness.
- [ ] Run `pnpm --filter=backend test -- web-room-access web-session`; confirm failures before implementation.
- [ ] Implement HMAC-SHA256 tokens with strict fixed claim schema, expiry and timing-safe signature comparison; require at least 32 bytes of random configured secret. Use 24 random bytes encoded as base64url for share codes, random UUID-based `web:` actor IDs, and store no guest token. Claim `inviteVersion` is SHA-256 of the current code, not the code itself. Authenticate by verifying then reloading the room and matching its current code hash for guests. An owner claim is accepted only when `chatId === null` and `ownerUserRef` exactly matches its `userRef`. Use 24 hours for guest sessions and 30 days for owner sessions; warn in the API docs that owners cannot recover lost credentials in this version.
- [ ] Implement `create` as a single room + default features write, with fresh owner and invite. `enable` is idempotent (conditional write when `shareCode` is null); `rotate` replaces the code and `disable` sets it null. Only the authorized adapters call invite mutation; no public route takes an internal room ID. Feature flag `WEB_ROOMS_ENABLED` defaults off; when on, require `WEB_SESSION_SECRET` and one `WEB_PUBLIC_ORIGIN` at startup. Do not log bearer tokens, invite codes, or owner pairing details.
- [ ] Rerun both specs. Commit `feat(backend): add revocable web room sessions`.

### Task 2: Telegram invite management

**Interfaces:** Use Task 1’s `setInvite` from `/config` callbacks `config:web:enable`, `config:web:rotate`, and `config:web:disable`. Invitation URL uses `${WEB_PUBLIC_ORIGIN}/room#${shareCode}` so the secret is not part of the initial HTTP request. Share the link via the requesting admin’s DM, not a group edit or `/info`.

- [ ] Write red controller specs: admin can enable/rotate/disable the selected topic room; a non-admin cannot mutate or read a code; private chat uses existing admin semantics; callback from the wrong chat/topic cannot mutate another room. A failed DM gives a callback instruction to start the bot privately or retry; it never posts a secret in the group. Feature off leaves existing keyboard and commands unchanged.
- [ ] Run `pnpm --filter=backend test -- playback.web-config`; expect the new behaviors to fail. Add the control to `playback.controller.ts` using its existing callback-location and admin checks; `enable` doubles as resend for an existing invite. Keep room lookup scoped to the callback’s chat/topic. Handle web actions before ordinary `CONFIG_FIELDS` lookup.
- [ ] Rerun the new spec and existing playback specs. Commit `feat(telegram): manage browser invites from room config`.

### Task 3: Shared HTTP commands and search

**Interfaces:** Base path `/api/web/v1`. `POST /rooms/join` accepts `{ shareCode, nickname }`; `POST /rooms` accepts `{ name, nickname }`. Authenticated paths derive the room only from `Authorization: Bearer <token>`: `GET /room`, `POST /room/search` `{ query, type?: 'song' | 'video' }`, `POST /room/requests` `{ selectionId, position: 'end' | 'next' }`, `POST /room/votes/next`, `POST /room/control` `{ action }`, and owner-only `POST /room/invite` `{ mode }` (returns the new URL or null). Supported controls: `play`, `pause`, `next`, `previous`, `radio`, `refresh`, `mute`, `unmute`, `volume-up`, `volume-down`; map the last two to the `volume` policy. Detached/offline player returns a typed unavailable result where the gateway requires one. `GET /room` returns only `{ name, role, queue, nowPlaying, playerOnline, capabilities }`; owner setup details are returned only on creation or to the authenticated owner in a dedicated `GET /room/setup`. A Telegram-linked guest never receives the player room ID.

- [ ] Write red integration specs covering invalid bodies/extra fields (`400`), missing/revoked token (`401`), unauthorized controls (`403`), unknown invite/selection (`404`), duplicate/full/quota outcomes (`409` with stable service status), and throttling (`429`). Assert a guest request creates `SongRequest.requesterId = web:<id>` and the Telegram adapter reads that same queue row. Concurrent Telegram/HTTP requests with one slot left must produce one add and one `queue-full`; concurrent votes must read fresh votes and must not issue duplicate skips for the same pending threshold.
- [ ] Run `pnpm --filter=backend test:e2e -- web-room`; confirm new routes fail. Implement strict DTO parsing with a small JSON body limit, trimmed printable nicknames (1–32 Unicode code points), room names (1–80), and queries (3–200). Apply shared-cache throttles before provider work: join/create per trusted client IP (10/min), search per actor (20/min), mutations per actor (30/min). Use atomic Redis counter+expiry operations for limits; trust forwarded IPs only behind explicitly configured trusted proxies, never arbitrary forwarding headers. Set `Cache-Control: no-store`, configure exact-origin CORS on web endpoints, and do not use ambient cookies.
- [ ] Implement room-scoped search selections: return `selectionId` and allowlisted display metadata; store provider results server-side keyed by room and actor for five minutes. Use only stored metadata when calling `QueueRequestService.request`; recheck `allowVideoSearch` at both search and queue-write time. Apply `authorizeControl` to feature-gated controls, leaving vote-based skip semantics separate. Require an admitted player for HTTP controls and return `409 player-offline` if unavailable. Browser guest identity and role never come from request bodies.
- [ ] Serialize queue check+insert per room inside the shared `QueueRequestService` (used by both adapters). Serialize vote read+decision inside shared `VoteService`, reading fresh votes under the lock; keep a short in-flight skip latch cleared by the next admitted track start or after five seconds so concurrent deciding votes cannot issue duplicate skips. Document that these mutation guarantees assume one backend instance, matching current player admission. Keep existing Telegram messages and extension events unchanged.
- [ ] Rerun the API and backend suites. Commit `feat(backend): expose shared room commands to web guests`.

### Task 4: Observer-only live state and integration gate

**Interfaces:** `/web-room` Socket.IO namespace. Handshake `auth.token` is validated using Task 1. The namespace emits `room:state` containing the same DTO as `GET /room`, initially and after changes. Observers send no player events. `WebRoomStateService.snapshot(roomId: string, actor: Actor): Promise<WebRoomState>` is shared by HTTP and the namespace.

- [ ] Write red socket integration specs: a valid observer receives initial state, queue additions from both transports, now-playing, and offline on player disconnect; an unauthorized or expired token cannot subscribe; old observers are disconnected when rotated/disabled and do not receive subsequent state. Confirm the existing player’s namespace room occupancy, queue acknowledgements, and command delivery are unchanged. A reconnect obtains a fresh state, not a stale replay.
- [ ] Add a regression assertion that an unadmitted socket cannot mutate the shared queue or votes by sending a track-start event. Gate track-start cleanup at the existing player gateway with the same room/session/device checks as `playback-report`; keep the payload and event name unchanged.
- [ ] Run the socket integration tests and confirm the behavior is absent. Implement namespace origin validation independent of HTTP CORS. Publish by room from queue/room mutations and accepted player reports, plus player admission and cleanup; check each observer’s room authorization on publication, recheck on reconnect, disconnect on expiry and proactively revalidate after invite mutation. Make `nowPlaying` nullable when there is no current observation from an admitted player; clear it on disconnect and never infer it from historical analytics. Only an admitted player’s validated updates may alter observer state; leave the extension wire format unchanged.
- [ ] Document routes, status codes, session limits, exact browser origin, secret handling, and the one-backend assumption in `docs/web-room-api.md`. Verify with a disposable room: Telegram admin enables invite → HTTP guest joins and requests song → Telegram `/queue` shows it → observer receives state → admin rotates invite → guest loses access. Run a separate web-only room creation and extension-admission check.
- [ ] Run `pnpm --filter=backend lint`, `test`, `test:e2e`, `build`, `db:check`, and `git diff --check`; record live smoke results separately from automated tests. Verify contract runs on both database providers. Commit `feat(backend): stream room state to browser observers`.
