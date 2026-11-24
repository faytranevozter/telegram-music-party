# Web Clients, Stage 4: Browser Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest can open a Telegram-issued invite on a phone, join without a Telegram account, request a song, and see the shared queue and live playback.

**Architecture:** A standalone `apps/web` client consumes the Stage 3 HTTP and Socket.IO contracts. Build the app separately and stage its generated assets into the existing landing Worker, which serves the room shell at `/room`. The player still runs exclusively in the extension; the web app is an observer and controller.

**Tech Stack:** React 19, Vite 6, Tailwind and HeroUI matching the extension, TypeScript, Vitest, Socket.IO client, Cloudflare Worker static assets.

**Spec:** [Approved web clients design](../specs/2026-11-23-web-clients-design.md), Stage 4. **API contract:** [Web room API](../../web-room-api.md).

## Global Constraints

- No Telegram account required for guests. No browser audio, extension protocol or device admission changes, new backend account system, or guest analytics screen.
- Telegram invite creation, rotation and disablement are already in `/config`; do not duplicate those controls for linked-room guests. Web-only owners use the existing owner API.
- Keep the invite code in the URL fragment (`/room#<code>`), never in a query, API path, analytics or logs. Keep bearer credentials off URLs and out of logs. Don't decode tokens to determine role; signed tokens are not encrypted.
- Build output is generated, not committed. Public API origin is a build-time public setting (`VITE_PARTY_API_ORIGIN`); no secrets in Vite or Worker assets. Production client origin is `https://ytparty.my.id`, API origin `https://music.ytparty.my.id`; local builds use explicit origins. No push, deploy, or feature-flag enablement without separate authorization.

## Review Focus

- Opening invite B while a session for invite A exists never shows or mutates A. Task 1.
- A stale search response or revoked token cannot repopulate a room after switching or leaving. Tasks 1–2.
- A dropped observer connection is not the same as an offline player; reconnect gets a fresh snapshot. Task 2.
- Queue-full, rate-limit and expired-selection responses leave the displayed queue correct and explain what to do next. Task 2.
- Direct `/room` navigation, refresh, and assets work under the Worker while `/privacy`, `/terms`, and unknown-route behavior remain intact. Task 3.

## File Map

- `apps/web/`: workspace manifest, Vite/TS/lint config, HTML shell, React entry and `src/styles.css`.
- `apps/web/src/api.ts`, `src/session.ts`, `src/use-room.ts`: typed client, tab-scoped credentials, and observer lifecycle.
- `apps/web/src/App.tsx`, `src/Room.tsx`, `src/OwnerSetup.tsx`: join/create, room controls, and owner setup. Colocate `*.test.ts[x]`; use a DOM test environment for component flows.
- `apps/web-landing/src/worker.ts`, `apps/web-landing/scripts/stage-room.mjs`, routing tests, `.github/workflows/web-deploy.yml`, `.github/workflows/ci.yml`: integration with the existing site and CI.
- `PRIVACY.md`, `TERMS.md`, `AGENTS.md`, `docs/web-room-api.md`: user disclosures, developer instructions, and rollout checklist.

### Task 1: Join, create, and restore a browser session

**Interfaces:** `createWebApi(origin: string, fetcher?: typeof fetch): WebApi` targeting `/api/web/v1`; `ApiError` exposes HTTP code and optional machine status. `readInvite(hash: string): string | null` accepts only a 32-character base64url code. `StoredSession = { token: string; expiresAt: number; inviteKey: string | null }` in tab-scoped `sessionStorage`; `inviteKey` is a SHA-256 digest of the invite, not the raw code. `readSession(storage: Storage, now: number): StoredSession | null` is safe on malformed storage.

- [ ] Set up `apps/web` with `dev`, `build`, `test`, and `lint` scripts; use Vite dev port 5173. Add red tests that a wrapped `401` preserves its HTTP status, requests never put tokens in URLs, malformed/expired stored sessions are ignored, and invite B never resumes the session matched to A. Verify with `pnpm --filter=web test`; expect the missing client/session behavior to fail.
- [ ] Implement typed API methods for join, create, state, search, queue, vote, control, setup, invite. JSON bodies use the exact Stage 3 DTOs. Use AbortSignal support on reads/search. Credential lookup is tied to the configured API origin and current invite; an invite-matching reload resumes, a different invite requires explicit join, and a hashless direct load can offer the current tab's session. Strip the fragment with `history.replaceState` only after successful join. Handle unavailable storage without blocking a new session. On `401`, clear only the session that failed, not a later replacement.
- [ ] Implement the join/create forms with real labels, visible validation and pending state. Use this flow: `Invite link → Choose nickname → Join room`; hashless entry offers `Create a room` or `Resume room` if available. For web-only creation, explain that the owner must keep the tab session to manage the room and that the player still needs the extension. Provide visible Privacy and Terms links.
- [ ] Run `pnpm --filter=web test`, `lint`, and `build`; expect all green. Commit `feat(web): join and create music party rooms`.

### Task 2: Shared queue, live playback, and owner tools

**Interfaces:** `RoomState` follows `WebRoomStateService.snapshot`: `name`, `role`, `queue[{title,videoId}]`, `playerOnline`, nullable `nowPlaying`, `capabilities` (`controls`, `playNext`, `playNextRemaining`, `videoSearch`). `useRoom(api, session)` loads `GET /room` and subscribes to `/web-room` with `{auth:{token}}`; returns room state, connection state and refresh. Owner setup uses `GET /room/setup` and `POST /room/invite`.

- [ ] Add failing tests for a late GET not overwriting a newer socket snapshot, old search results ignored after a newer query or session change, a revocation disconnect followed by HTTP `401` clearing the session, capability-gated controls, no optimistic queue append on `409`, and `429` / stale selection feedback. Run the targeted tests and verify failures before wiring the room.
- [ ] Implement the mobile-first room layout: `Room name + connection status`, `Now playing / player offline`, `Search → results + Add to queue / Play Next`, then `Shared queue + Vote to skip`. Display only advertised controls; disable playback commands while the player is offline, but preserve permitted queue actions. Expose Play Next remaining uses when the server supplies them. Render all server text as text, never HTML. Show loading, empty and retry states; keyboard focus and live status announcements must work without a mouse.
- [ ] Implement Socket.IO state precedence and cleanup: disconnect the old socket and abort in-flight reads on leaving or switching; on reconnect consume the fresh snapshot; on server disconnect revalidate via HTTP and clear the session only on confirmed auth failure. Display reconnecting separately from player offline. Refresh after successful mutations as a fallback; never overwrite live state with an older in-flight response. An expired selection prompts a new search; a rate-limited action does not retry automatically.
- [ ] Implement owner-only setup and invite controls: copy the player room ID and current invite separately, show how to point the extension at the configured API origin, confirm rotate/disable, and update the displayed invite from the server. Disable owner tools while pending; never expose them in a guest view. Test copy failure and owner access after rotation.
- [ ] Rerun `pnpm --filter=web test`, `lint`, and `build`. Commit `feat(web): show live room playback and shared queue`.

### Task 3: Serve `/room` and close the release checks

- [ ] Add failing Worker route tests: `GET/HEAD /room` serves the client shell, client asset URLs resolve, a missing asset returns `404`, and `/privacy`, `/terms`, and existing landing routes still work. Use the existing landing test conventions. Verify RED with `pnpm --filter=web-landing test`.
- [ ] Build with a dedicated absolute Vite base such as `/room-app/`; stage `apps/web/dist` only into `apps/web-landing/public/room-app/`, ignored by Git. Map `/room` and `/room/` to `/room-app/index.html` without reflecting the invite; keep API and socket endpoints at their existing backend origin. Add a staging script that fails clearly if the bundle is missing. Wire web lint/test/build into CI and build/staging into the existing Worker pipeline. Include `apps/web/**`, workspace/lockfile, and both legal source files in deployment path filters. Do not run a deployment now.
- [ ] Update Privacy and Terms to include browser guests, nickname/session handling, pseudonymous requests, rate limiting and invite sharing. Describe observed storage, not hypothetical analytics collection. Regenerate `/privacy` and `/terms` with `pnpm --filter=web-landing build:legal`. Document local run commands and the exact origin pair; verify the preview does not silently target production during testing.
- [ ] Run `pnpm --filter=web test`, `lint`, `build`, then stage and test the Worker. Inspect the built flow on a narrow viewport using browser automation: invite → join → search → add → queue update; verify keyboard operation, offline/reconnect, owner flow, and revoked invite. Run a separate test-room smoke check with the Telegram link and actual extension when available; report whether a real group and actual playback were exercised. Keep feature flags off until the staged browser build and tests are accepted. Commit `feat(web): serve the browser room on the landing Worker`.
