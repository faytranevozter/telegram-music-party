# Web Guest Request Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a web-room host limit how frequently each guest session adds tracks.

**Architecture:** Persist room policy through the existing host-only settings API. Enforce the rolling quota in the queue-request path using room/session-scoped Redis timestamps, independently of traffic throttling and Play Next’s daily limit. Show the settings and a retry message in the web client.

**Tech Stack:** NestJS, Prisma (PostgreSQL and SQLite), Redis, React, daisyUI, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-web-guest-request-limit-design.md`

## Global Constraints

- Web guests in web-created rooms only; hosts and Telegram untouched. A fresh invite session starts fresh.
- `guestRequestLimit`: `0–100`, default `0` (disabled); `guestRequestPeriodMinutes`: `1–1440`, default `10`.
- Queue and Play Next share the allowance; daily Play Next and queue capacity still apply. Count accepted adds only; no refund when a track plays or is removed.

## Review Focus

- Parallel requests cannot exceed the limit or charge for a duplicate or failed insert.
- An accepted track cannot be charged twice because the browser retries or refreshes its search selection.
- A reduced limit may require multiple older requests to expire before a slot is available.
- Changes to the period or temporarily disabling the rule must not reset retained history.
- A room policy must not affect another room, a new invite identity, a host, or Telegram.

### Task 1: Persist and expose host policy

**Files:** `apps/backend/prisma/schema.prisma`, derived SQLite schema and both migration directories, `apps/backend/src/app/playback/web/web-room-settings.service.ts` and `web-room-settings.spec.ts`.

- [ ] Add failing settings tests: the defaults are `0` and `10`, patch `{ guestRequestLimit: 3, guestRequestPeriodMinutes: 10 }` persists both, `101`, `0` minutes, fractions and strings are rejected without mutation, and guest reads/writes stay forbidden.
- [ ] Run `pnpm --filter=backend test -- web-room-settings.spec.ts` and confirm the new assertions fail.
- [ ] Add both integer fields to `Feature`; sync the SQLite schema, create additive migrations for both providers, and generate the client with `pnpm --filter=backend db:generate`. Extend `RoomSettings` and its existing allowlist with the exact bounds above. Keep the write atomic and the existing room-change notification.
- [ ] Run schema parity, the focused tests, and exercise both migrations against disposable databases; report any provider not available for verification.

### Task 2: Enforce the rolling quota

**Files:** New `apps/backend/src/app/playback/core/guest-request-quota.service.ts` and its spec; update `queue-request.service.ts`, its specs and constructors/test harnesses, `playback.module.ts`, `web-room.service.ts`, and `apps/backend/test/web-room.e2e-spec.ts`.

**Interface:** `GuestRequestQuotaService.reserve(roomId, userRef, limit, periodMinutes)` returns either `{ allowed: true, reservationId: string }` or `{ allowed: false, retryAt: number }` (epoch milliseconds). `release(roomId, userRef, reservationId)` undoes a reservation if the queue write fails. HTTP quota rejection is `429` with `{ status: 'guest-request-limit', retryAt: number }`.

- [ ] Write failing tests: with `3 / 10`, accept a mix of three Queue/Play Next adds, reject the fourth, and allow it exactly ten minutes after the oldest counted request. Cover parallel adds, separate guests and rooms, session reuse vs rejoin, duplicate/rejected/failed insert behavior, non-refund on playback, disabled quota, host and Telegram exemptions, and the retry timestamp after lowering a limit from three to one while three requests are still in the window. Exercise period expansion and disable/re-enable without losing retained history.
- [ ] Run focused quota and queue tests and confirm failure.
- [ ] Pass web-room eligibility and current policy from `WebRoomService` to the shared queue operation. Under its existing room lock, reserve only after ordinary queue and Play Next checks and before insertion. Keep the reservation on successful insertion; release only on confirmed insert failure. If Redis cannot reserve, reject the limited add without mutating the queue. Do not change existing API-wide rate limits.
- [ ] Implement reserve as an atomic Redis operation using a sorted set per room/session, unique reservation IDs, server time and 24-hour retention. Ignore expired entries, count only the configured window, and compute `retryAt` from the oldest entry that must expire to bring usage below the current limit. Map quota rejection separately from daily Play Next rejection. Run backend tests/build and enabled web-room E2E against disposable Redis and database.

### Task 3: Add controls and retry feedback

**Files:** `apps/web/src/api.ts`, `RoomSettings.tsx`, `RoomSettings.test.tsx`, `Room.tsx`, `queue-selection.test.ts`, and `docs/web-room-api.md`.

- [ ] Write failing tests for loading and saving both settings; disabled limit keeps its configured period; the specific `429` message displays the retry time without clearing search results; generic `429` and Play Next errors still work as before.
- [ ] Run `pnpm --filter=web test` and confirm failure.
- [ ] Extend the settings form with **Tracks per guest** and **Limit period (minutes)**. Keep period visible and editable when the limit is off, and explain `0` means unlimited. Preserve the validated `retryAt` on `ApiError` and show a localized retry time for the specific quota rejection. Other API errors and settings remain unchanged.
- [ ] Document the settings, session scope, and `429` response. Run web tests/build/lint and check the form and quota feedback in a browser. Leave code and commits untouched until the plan is approved for execution.
