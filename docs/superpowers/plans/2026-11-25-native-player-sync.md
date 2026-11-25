# Native Player State Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Telegram and the web room in sync with controls used directly on the admitted YouTube Music player.

**Architecture:** The extension reports deduplicated snapshots of the active media element over its existing player socket. The backend owns the last accepted snapshot, broadcasts it via the existing room state channel, and produces notifications from actual media transitions rather than command handlers.

**Tech Stack:** TypeScript, native media events, Socket.IO, NestJS, React, Vitest, Jest.

**Spec:** `docs/superpowers/specs/2026-11-25-native-player-sync-design.md`

## Global Constraints

- No new dependencies or database changes.
- Keep track-start announcements, queue behavior, and analytics independent.
- Initial and reconnect snapshots must not notify Telegram.
- Only the admitted player can submit state. Use the existing room state channel for web clients.

## Review Focus

- A media element mounted late or swapped during navigation must be observed; old video events must be ignored.
- A volume slider drag should give one notification for its settled value.
- End/track change should not masquerade as a pause or resume of the same track.
- Rejected sessions, invalid input, and duplicate reports must not mutate room state.
- Offline/older players have no confirmed state; the web room must not pretend commands succeeded.

### Task 1: Report actual player changes

**Files:** Create `apps/extension/src/lib/player-state.ts` and `player-state.spec.ts` next to it; modify `apps/extension/src/lib/index.ts`.

**Interface:** `watchPlayerState(report: (state: PlayerState) => void)` returns a handle with `sync()` (initial snapshot) and `stop()`. `PlayerState` carries `state: 'playing' | 'paused' | 'standby'`, `videoId: string | null`, `song: string`, `artist: string`, `volume: number | null` (0–100), and `muted: boolean | null`. Send snapshots as `player-state` with `roomId`, only while joined and connected.

- [x] Add tests for a silent baseline, pause/play events, standby on end, late or replaced videos, and coalesced `volumechange` events. Assert the emitted state transitions `playing → paused → playing → standby` and that a drag from 25 to 50 to 70 settles at 70.
- [x] Run `pnpm --filter=extension test player-state.spec.ts`; expect failure before the watcher exists.
- [x] Listen for `play`, `pause`, `ended`, `emptied`, `loadedmetadata`, and `volumechange` on the current video via document capture; reconcile video replacement, deduplicate snapshots, and debounce volume. Seed state when joined and stop on page hide. Remove direct play/pause/volume/mute notifications from Socket.IO command handlers, preserving queue-empty and track-start messages.
- [x] Rerun the focused extension tests; expect all to pass.

### Task 2: Accept state and publish it to Telegram and the web room

**Files:** Modify `apps/backend/src/types/playback.type.ts`, `apps/backend/src/app/playback/playback.gateway.ts`, `apps/backend/src/app/playback/playback.gateway.spec.ts`, `apps/backend/src/app/playback/telegram-notifier.ts`, and `apps/backend/src/app/playback/web/web-room-state.service.ts`.

**Interfaces:** `PlaybackGateway.onPlayerState(socket, data: unknown)` handles `player-state`; `currentPlayerState(roomId)` returns the current snapshot or `null`. `WebRoomStateService.snapshot()` exposes `playerState: { state, volume, muted } | null`.

- [x] Test that the first report updates the web snapshot without Telegram, same-track pause/resume sends one notification each, identical reports send none, volume from 25 to 70 sends `direction: 'increased', volume: 70`, standby/track changes do not send pause/resume, and bad payloads, non-admitted sockets, and disconnected sockets cannot change state.
- [x] Run `pnpm --filter=backend test --runInBand playback.gateway.spec.ts`; expect failure before the handler exists.
- [x] Validate and store snapshots under the admitted session, clearing on leave/disconnect. Publish state changes using `roomChanged`. Compare against the previous snapshot for actual transitions, reuse existing Telegram notifications except for a distinct resume message, and never send Telegram messages in web-only rooms.
- [x] Rerun the focused gateway and Telegram notifier tests; expect all to pass.

### Task 3: Show confirmed state in the web room

**Files:** Modify `apps/web/src/api.ts` and `apps/web/src/Room.tsx`; add a focused regression alongside existing `Room` tests.

- [x] Test that a room snapshot changing from playing at 25% to paused/muted at 70% updates the play button and volume display without a control click. Verify snapshots without `playerState` remain usable and show no fabricated volume.
- [x] Run `pnpm --filter=web test`; expect the regression to fail before the UI reads confirmed state.
- [x] Add optional `playerState` to `RoomState` for compatibility with older backends. Derive status, play/pause and mute controls, and volume from the room snapshot instead of recording the last successful control request.
- [x] Run affected app tests and builds plus `git diff --check`. Where a live room and admitted YouTube Music player are available, verify with native play/pause and a slider drag while watching Telegram and two web clients.
