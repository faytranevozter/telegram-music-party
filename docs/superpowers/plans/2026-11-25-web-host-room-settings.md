# Host-only Web Room Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let web-room hosts configure queue, skip voting, Play Next, and video search from the room page.

**Architecture:** Add owner-authenticated settings endpoints backed by the existing `Feature` record, publishing a room change after an atomic update. Add a host-only settings component that loads and saves those values while existing room snapshots update connected guests.

**Tech Stack:** NestJS, Prisma, Socket.IO, React, TypeScript, daisyUI, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-web-host-room-settings-design.md`

## Global Constraints

- Only owners of web-created rooms can read or change settings; Telegram-linked rooms continue using `/config`.
- Expose only `maxQueueSize`, `minimumVotes`, `playNextCommand`, `dailyPlayNextLimit`, and `allowVideoSearch`.
- Minimum queue size and votes are 1; daily limit minimum is 0, meaning unlimited. Boolean fields must be actual booleans.
- Preserve existing defaults, queued tracks, votes, daily usage, invite behavior, and Telegram UI and permissions; no schema migration.
- Keep settings out of guest snapshots. After saving, publish room changes so guest capabilities refresh.

## Review Focus

- A valid field paired with an invalid field must not be partially saved (Task 1).
- Oversized, fractional, or non-finite numeric input must be rejected before reaching Prisma (Task 1).
- Guests, expired sessions, and owners of another room cannot access or modify a room's settings (Task 1).
- A failed or interrupted save must not discard the host's draft; a revoked session must use the existing sign-out flow (Task 2).
- A connected guest must receive changed capabilities and server enforcement must still reject disabled actions (Task 3).

## File Structure

- Modify `apps/backend/src/app/playback/web/web-room.controller.ts`: authenticated read and rate-limited update routes.
- Create `apps/backend/src/app/playback/web/web-room-settings.service.ts`: field allowlist, validation, atomic persistence, and room-change notification.
- Modify `apps/backend/src/app/playback/playback.module.ts`: register the settings service.
- Create `apps/backend/src/app/playback/web/web-room-settings.spec.ts`: service and HTTP authorization/validation tests.
- Modify `apps/web/src/api.ts`: typed settings request methods.
- Create `apps/web/src/RoomSettings.tsx`: host settings form and draft lifecycle.
- Modify `apps/web/src/Room.tsx`: render the host-only settings panel.
- Create `apps/web/src/RoomSettings.spec.tsx` and extend existing API/room tests using the repository's existing test conventions.
- Extend `apps/backend/test/web-room.e2e-spec.ts` and `docs/web-room-api.md` for live updates, enforcement, and API contract.

### Task 1: Owner-only settings API

**Files:** Create `apps/backend/src/app/playback/web/web-room-settings.service.ts`, `apps/backend/src/app/playback/web/web-room-settings.spec.ts`; modify `apps/backend/src/app/playback/web/web-room.controller.ts`, `apps/backend/src/app/playback/playback.module.ts`.

**Interfaces:** Define `RoomSettings` as `{ maxQueueSize: number; minimumVotes: number; playNextCommand: boolean; dailyPlayNextLimit: number; allowVideoSearch: boolean }`. `WebRoomSettingsService.get(roomId: string): Promise<RoomSettings>` returns only these fields. `update(roomId: string, value: unknown): Promise<RoomSettings>` accepts a nonempty partial object, validates every field first, applies one Prisma update, returns the complete updated settings, and calls `PlaybackGateway.roomChanged(roomId)` only after success. `GET /api/web/v1/room/settings` returns `RoomSettings`; `POST /api/web/v1/room/settings` accepts a partial settings object and returns `RoomSettings`.

- [ ] **Step 1: Write failing tests.** Test owner GET returns exactly five fields; owner POST updates multiple fields atomically and notifies once; unauthenticated/expired sessions get 401; guest GET/POST get 403; a session cannot supply another room ID. Assert unknown keys, empty objects, arrays, wrong types, strings, fractional values, negatives, zero queue/votes, and integers above 2,147,483,647 are 400 with no database write or notification. Assert daily limit 0 is accepted, and one valid plus one invalid field causes no write. Assert a database failure does not notify.
- [ ] **Step 2: Run the failing tests.** Run `pnpm --filter=backend test -- web-room-settings.spec.ts`; expect failures because the settings service and routes do not exist.
- [ ] **Step 3: Implement the service and routes.** Use session `room.id`, never a client-supplied room identifier; require `actor.isAdmin()` for both routes and use the existing mutation rate limiter for POST. Validate integers as safe Prisma `Int` values in the range from each field's minimum through 2,147,483,647. Use one `prisma.feature.update` with the validated partial object and select only the five fields. Return 404 if the room's feature record is missing; keep responses `Cache-Control: no-store`.
- [ ] **Step 4: Verify.** Run `pnpm --filter=backend test -- web-room-settings.spec.ts` and `pnpm --filter=backend build`; expect passing tests and a successful build.
- [ ] **Step 5: Commit.** Commit only these files as `feat: add host room settings API`.

### Task 2: Host settings panel

**Files:** Create `apps/web/src/RoomSettings.tsx`, `apps/web/src/RoomSettings.spec.tsx`; modify `apps/web/src/api.ts`, `apps/web/src/Room.tsx` and existing API tests if present.

**Interfaces:** Export the same `RoomSettings` shape in `api.ts`; add `settings(token: string, signal?: AbortSignal): Promise<RoomSettings>` and `updateSettings(token: string, settings: Partial<RoomSettings>): Promise<RoomSettings>` to `createWebApi`. Render `RoomSettings` for `state.role === 'owner'` directly after `OwnerSetup`, using the existing `onRevoked` and feedback patterns.

- [ ] **Step 1: Write failing tests.** Check request paths, bearer token, GET/POST bodies and returned values. Check host-only rendering, initial loading, current values, input labels, collapsed panel, toggles, minimums and 0 = unlimited help. Check turning Play Next off disables but preserves its limit. Check Save submits the five current values, displays success, and updates the baseline; invalid numbers are blocked. Check failed save preserves edits and permits retry, 401 invokes `onRevoked`, and pending requests do not update an unmounted component. Check load failure offers retry. Follow existing web test conventions; if DOM testing support is absent, add the minimum test-only tooling needed.
- [ ] **Step 2: Run the failing tests.** Run `pnpm --filter=web test`; expect the new tests to fail before implementation.
- [ ] **Step 3: Implement API and form.** Use a daisyUI collapse titled `Room settings`, explicit `Save changes`, labeled numeric fields and accessible switches. Load settings separately from guest snapshots. Keep numeric input drafts as strings until validated; submit only integers within server bounds. Disable inputs while saving, retain the submitted draft on failure, and avoid applying results after unmount. Display server errors with the existing flash conventions.
- [ ] **Step 4: Verify.** Run `pnpm --filter=web test`, `pnpm --filter=web build`, and `pnpm --filter=web lint`; expect success.
- [ ] **Step 5: Commit.** Commit only task files and any necessary test tooling as `feat: add web host settings panel`.

### Task 3: End-to-end behavior and documentation

**Files:** Modify `apps/backend/test/web-room.e2e-spec.ts`, `docs/web-room-api.md`; adjust existing test fixtures if needed.

**Interfaces:** Consume Task 1's routes and Task 2's client methods. Existing `room:state` snapshots remain guest-safe and expose changed `capabilities.playNext` and `capabilities.videoSearch`.

- [ ] **Step 1: Write failing integration tests.** With an owner and connected invited guest, change Play Next and video search; assert a subsequent guest `room:state` contains the changed capabilities but no editable settings. Attempt disabled actions through the API and assert they are rejected; re-enable them and assert capabilities update. Verify limits apply to subsequent requests, saved values survive a fresh GET, and lowering limits does not remove existing queue entries or votes. Verify Telegram `/config` still triggers a room snapshot using its existing test harness.
- [ ] **Step 2: Run the tests.** Run `pnpm --filter=backend test:e2e -- web-room.e2e-spec.ts`; observe any failures and fix the responsible implementation rather than weakening assertions. If the environment lacks required database/Redis services, record the exact blocker and still run isolated tests.
- [ ] **Step 3: Complete integration and document.** Fix any synchronization or enforcement gaps revealed by the test, using existing room-change and authorization services. Document both endpoints, the five fields and ranges, host-only authorization, partial updates, and live guest capability refresh in `docs/web-room-api.md`.
- [ ] **Step 4: Verify the complete change.** Run `pnpm --filter=backend test`, `pnpm --filter=backend test:e2e`, `pnpm --filter=backend build`, `pnpm --filter=web test`, `pnpm --filter=web build`, and `pnpm --filter=web lint`. Report any environmental blockers explicitly.
- [ ] **Step 5: Commit.** Commit only this task's files as `test: verify web room settings propagation`.
