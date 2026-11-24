# Web Autoplay Queue Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Track work using the checkboxes below.

**Goal:** Show the next five autoplay tracks from the connected player on demand in the web room.

**Architecture:** An authenticated, read-only endpoint reuses the existing player queue acknowledgement and returns a bounded, filtered preview. A local daisyUI switch controls whether the web client fetches and displays that preview; ordinary room snapshots never wait for the player queue.

**Tech Stack:** NestJS, Socket.IO, React, daisyUI, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-web-autoplay-preview-design.md`

## Global Constraints

- Preview is off by default and available to both web hosts and invited guests.
- Display a maximum of five upcoming non-requested player tracks; never write player or room state.
- No Prisma or extension protocol changes. Preserve the requested queue and Telegram behavior.

## Review Focus

- One slow player acknowledgement is shared across concurrent viewers of the same room, not across rooms.
- An offline or replaced player must not leave a stale queue visible.
- Current, history, and shared-request tracks do not appear in the autoplay list.
- An acknowledgement that is malformed or times out does not break the requested queue.
- Turning the switch off during a fetch cancels that view’s refresh and ignores late responses.

### Task 1: Expose the read-only preview

**Files:** Extend `apps/backend/src/app/playback/web/web-room.controller.ts`, `apps/backend/src/app/playback/web/web-room.service.ts`, and `apps/backend/test/web-room.e2e-spec.ts`; add focused tests beside the web service and document the endpoint in `docs/web-room-api.md`.

**Interface:** `GET /api/web/v1/room/autoplay` returns `{ status: 'ok', tracks: { videoId: string; title: string; artist: string }[] }` or `{ status: 'offline' | 'unavailable' | 'timeout' }`. Read the room ID from the existing bearer session, require no owner role, apply a per-actor limit of 20 requests/minute and send `Cache-Control: no-store`.

- [ ] Write failing tests for a five-track cap, source order, exclusion of current/history/request IDs, empty versus unreadable queues, concurrent reads per room, and guest access with a simulated admitted player. Verify missing/revoked sessions get 401.
- [ ] Run the focused tests and observe failure because the preview is not implemented.
- [ ] Reuse `PlaybackGateway.getPlayerQueue`; verify the player is admitted, coalesce only in-flight reads per room, and do not persist completed responses. Slice after the current marker; if it is absent, use the reported current track as an anchor only if it can be identified unambiguously. Return unavailable rather than treating possible history as upcoming when the starting point is unknown.
- [ ] Run the backend tests/build and enable the web-room E2E suite against disposable SQLite and Redis. Expect all to pass.

### Task 2: Render the preview in Up next

**Files:** Extend `apps/web/src/api.ts`, `apps/web/src/Room.tsx`, and `apps/web/src/RoomPanels.tsx`; create `apps/web/src/AutoplayPreview.tsx` and `apps/web/src/AutoplayPreview.test.tsx`.

**Interface:** `WebApi.autoplay(token: string, signal?: AbortSignal): Promise<AutoplayPreviewResult>` consumes Task 1’s response. Keep toggle state in the room view and pass player-online status to the preview.

- [ ] Write failing tests for no request while hidden, rendering separately on toggle, refresh while visible, stopping and ignoring late responses when hidden or disconnected, empty/error feedback, and preserving shared requests and their count.
- [ ] Run the web tests and observe failure because the preview is not implemented.
- [ ] Add the daisyUI **Show autoplay** switch. Fetch immediately when shown with the player online and refresh every 10 seconds after a request settles. Stop on hide/offline/unmount and abort obsolete reads. Show loading, empty, offline, and unavailable states in the preview only. Use the existing session-revocation flow for 401.
- [ ] Run web tests, build, and lint. Check the toggle and separate list at mobile and desktop sizes. Leave commits to user authorization.
