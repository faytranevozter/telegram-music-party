# Web Host Volume Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Volume Up and Volume Down by default for hosts of new and existing web-created rooms.

**Architecture:** Pass room identity and features to the shared web control check used by capability snapshots and command execution. Grant the web host default there; fall back to existing feature checks for everyone else.

**Tech Stack:** TypeScript, NestJS, Jest.

**Spec:** `docs/superpowers/specs/2026-11-25-web-host-volume-default-design.md`

## Global Constraints

- Do not change guest permissions, Telegram controls, stored settings, or offline player handling.

## Review Focus

- Both volume actions must be advertised and authorized for the web host.
- Guests still follow the stored flag, and a linked room does not receive the web host default.
- The host cannot send either command without an online player.

### Task 1: Enable both volume actions for the web host

**Files:** `apps/backend/src/app/playback/web/web-room-state.service.ts`, `apps/backend/src/app/playback/web/web-room.service.ts`, and `apps/backend/test/web-room.e2e-spec.ts`.

- [x] Add integration assertions that a host gets both capabilities with `volumeCommand: false` and can emit both events to a joined player, while the guest does not get the capabilities and receives 403. Verify an enabled stored flag still allows the guest, a Telegram-linked room with the flag off still denies volume, and an offline host gets the existing 409 response.
- [x] Run the enabled web-room E2E suite with disposable SQLite and Redis and confirm the host capability assertion fails.
- [x] Change `controlAccess(room: Pick<Room, 'chatId' | 'ownerUserRef'> & { Feature: Feature | null }, action: WebControl, actor: Actor)` to grant both volume actions to the authenticated web owner of a web-created room. Keep existing fallbacks. Pass the room from `snapshot` and `WebRoomService.control`.
- [x] Rerun the enabled E2E suite, backend unit suite and build, and `git diff --check`. Leave changes uncommitted unless asked to commit.
