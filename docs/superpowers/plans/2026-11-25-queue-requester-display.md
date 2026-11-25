# Queue Requester Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let room hosts and Telegram admins choose how requester names appear in both queues.

**Architecture:** Persist the room policy and request-time display name separately. Resolve the public label on the server for web snapshots and Telegram’s `/queue`; keep player payloads explicitly projected to their original fields.

**Tech Stack:** Prisma (PostgreSQL and SQLite), NestJS, Telegraf, React, daisyUI, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-queue-requester-display-design.md`

## Global Constraints

- `hidden` (default), `anonymous`, `name`; no per-track setting. Same policy for both surfaces.
- Do not expose names in Anonymous/Hidden, add attribution to autoplay or now playing, or change the player protocol.

## Review Focus

- New nullable columns must not disclose historical names; existing rooms stay Hidden.
- Analytics failure must not affect attribution; duplicate adds must not replace a name.
- A live settings change must remove names from subsequent web HTTP and observer snapshots.
- Forged or non-admin Telegram callbacks and web guest writes must not change the setting.
- Names must render as text, including Telegram HTML metacharacters; the extension must not receive them.

### Task 1: Persist policy and attribution

**Files:** `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/sqlite/schema.prisma`, both provider migration directories, `apps/backend/src/app/playback/playback.service.ts`, `apps/backend/src/app/playback/core/queue-request.service{,.spec}.ts`, `apps/backend/src/app/playback/playback.gateway{,.spec}.ts`, new `apps/backend/src/app/playback/core/requester-display{,.spec}.ts`.

- [ ] Add tests for `requesterLabel(mode, displayName)` returning `undefined`, `Anonymous`, and `Alex` in the three modes; invalid modes and unknown names in Name mode return `undefined`. Assert both queue paths forward the actor’s name, even if analytics fails, duplicates do not write, and the extension’s `joined` packet excludes the name.
- [ ] Run `pnpm --filter=backend test -- requester-display queue-request.service playback.gateway` and observe the new contract fail before wiring it.
- [ ] Add `Feature.requesterDisplay String @default("hidden")` and `Queue.requesterDisplayName String?` with additive provider migrations. Add a final optional display-name parameter to both queue writes; store up to 80 Unicode code points of the trimmed actor display name after stripping control characters, or null when empty. Add the shared policy type, validator, and `requesterLabel(mode: unknown, displayName: string | null | undefined): string | undefined`. Exclude the new queue field from the player `joined` payload. Regenerate the client and SQLite schema.
- [ ] Rerun focused tests, run schema parity, and apply both migrations to disposable databases where available. Verify default Hidden and null names on preexisting rows.

### Task 2: Apply policy to web settings and queue

**Files:** `apps/backend/src/app/playback/web/web-room-{settings,state}.service.ts`, `apps/backend/src/app/playback/web/web-room-settings.spec.ts`, `apps/backend/test/web-room.e2e-spec.ts`, `apps/web/src/{api.ts,Room.tsx,RoomPanels.tsx,RoomSettings.tsx,RoomSettings.test.tsx}` and web queue rendering tests.

- [ ] Add tests for host save/read, invalid mode rejection, guest denial, and HTTP and live observer snapshots changing `requesterLabel` from `Alex` to `Anonymous` to absent with no raw name or reference. Add form and queue rendering tests for all modes, including unchanged autoplay.
- [ ] Run focused backend tests and `pnpm --filter=web test`; verify expected failures. Run the enabled E2E suite with disposable SQLite and Redis for the observer assertions.
- [ ] Allow the three values under `requesterDisplay` in the host settings API. Serialize only optional `requesterLabel` on queue tracks using Task 1’s helper. Add the labeled select and help to the existing host form and render `Requested by <label>` beneath requested tracks using text rendering. Keep the existing room-change notification.
- [ ] Rerun focused tests, enabled E2E, web tests, build and lint; verify the settings and labels in a browser.

### Task 3: Apply the same policy to Telegram

**Files:** `apps/backend/src/app/playback/playback.controller.ts`, `apps/backend/src/app/playback/playback.web-config.spec.ts`, `apps/backend/test/web-room.e2e-spec.ts`, `docs/web-room-api.md`.

- [ ] Test `/config` mode selection, admin checks, invalid callback rejection, and the same policy reaching linked web viewers. Test `/queue` with all modes, an HTML-sensitive display name, legacy rows, and no labels on player/autoplay entries.
- [ ] Run focused Telegram tests and the enabled linked-room integration cases and observe the new assertions fail.
- [ ] Use existing Telegram admin guards and room/topic resolution. Validate the mode with the shared validator before persisting and notifying observers. Match requested entries to their queue rows by video ID when composing `/queue`; use `requesterLabel` and `escapeHtml`, leaving autoplay and now playing untouched. Preserve the existing message budget. Document both configuration paths and fields.
- [ ] Run full backend tests/build, enabled web-room E2E, and `git diff --check`. Leave uncommitted unless the user asks to commit.
