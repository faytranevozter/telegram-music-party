# Web Clients, Stage 2: Room and Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rooms capable of existing without Telegram and namespace stored participant IDs without losing existing analytics, votes, or today's Play Next usage.

**Architecture:** Keep the existing room primary key and player protocol. Add nullable room fields and backfill Telegram references in provider-specific migrations. Use the same formatter for Telegram reads and writes; bridge existing Redis counters lazily, without scanning Redis.

**Tech Stack:** NestJS, Prisma 6.5.0, PostgreSQL, SQLite, Keyv/Redis, Jest.

**Spec:** [Web clients design, Stage 2](../specs/2026-11-23-web-clients-design.md).

## Global Constraints

- Ship the database backfill and application identity cutover together. Do not deploy an intermediate commit or run old and new backends concurrently against the migrated database.
- PostgreSQL and SQLite both remain supported. The canonical schema is `apps/backend/prisma/schema.prisma`; run `db:sync`, `db:check`, and regenerate the provider-specific Prisma client.
- Keep the internal room ID, the extension protocol, Telegram topic mapping, queue/request correlation, and analytics counting rules unchanged.
- Existing linked rooms have `shareCode = null`; this stage creates no public web routes and does not generate, display, or accept invite codes. Guest sessions, owner authorization, and invite management belong to Stage 3 or later.
- Use disposable databases only for automated checks. No production migration or deployment in this task.

## Review Focus

Execution correction: requester rankings are part of `/stats`, not `/top`.
Keep the existing command surface and exercise `/stats` and `/history` for requester formatting.

- SQLite `Room` rebuild with populated children must not delete queues, votes, devices, features, requests, or linked playback sessions. Task 2.
- A topic and a root room for the same Telegram chat still resolve independently; two chatless rooms can coexist. Task 2.
- Null requesters stay anonymous; malformed references do not become Telegram profile links. Tasks 1 and 2.
- An existing counter at 2 increments to 3 after cutover, not 1 or 5; other rooms and web actors cannot inherit it. Task 1.
- The Redis bridge and SQL backfill preserve exact IDs, including large IDs; prior-day keys do not count today. Tasks 1 and 2.

## File Map

All backend paths below are relative to `apps/backend/`.

- `src/app/playback/core/user-ref.ts` and `.spec.ts`: exact Telegram ID encoding and decoding.
- `src/app/playback/telegram-actor.ts`, `playback.controller.ts`, `playback.stats.controller.ts`, and their existing specs: identity at Telegram adapter boundaries.
- `src/app/playback/core/play-next-quota.service.ts` and `.spec.ts`: migration-compatible daily counters. `queue-request.service.ts` and `.spec.ts`: absent requester handling.
- `prisma/schema.prisma`, generated `prisma/sqlite/schema.prisma`, and `prisma/{,sqlite/}migrations/20261124000000_web_room_identity/migration.sql`: room fields and historical data.
- `src/app/playback/playback.service.ts`, `scripts/test-database.mjs`, `scripts/fixtures/stage-2-before.sql`, and `scripts/test-stage-2-upgrade.mjs`: room persistence and upgrade assertions.
- `docs/database.md`, `docs/analytics.md`, and `AGENTS.md` at repository root: cutover, rollback, and identity documentation.

---

### Task 1: Switch Telegram identity at the boundary and preserve Redis quotas

**Interfaces:** `telegramUserRef(id: number | string): string` produces `telegram:<decimal-id>` without converting strings to numbers. `telegramIdFromUserRef(ref: string): string | null` accepts only an exact prefixed positive decimal ID. `PlayNextQuotaService.used`, `remaining`, and `record` keep their existing signatures. `Actor.userRef` remains a string; use `''` when Telegram provides no sender, not a fabricated account. `QueueRequestService` passes `actor.userRef || null` to analytics.

- [ ] Add red tests: `expect(telegramUserRef('9007199254740993')).toBe('telegram:9007199254740993')`; `expect(telegramIdFromUserRef('web:42')).toBeNull()` and likewise for `telegram:4<script>`, `telegram:`, and a bare ID. In `telegram-actor.spec.ts`, assert `'telegram:7'` and `''` for missing sender. In the stats spec, assert `/mystats` queries `'telegram:77'`, a tagged Telegram requester renders `tg://user?id=77`, and `web:77` renders `Web guest` without a Telegram link in both `/top` and `/history`; malformed/unknown refs render `unknown`. Assert an absent requester is recorded as `null` in the queue service spec.
- [ ] In `play-next-quota.service.spec.ts`, freeze local time at noon via Jest and seed real in-memory Keyv. Assert `used('room', 'telegram:42')` returns 2 from legacy `playnext-daily:room:42:<today>`; first `record` yields 3 under `playnext-daily:room:telegram:42:<today>`; another yields 4 even while the original key remains at 2. Assert a new-key value of 0 is authoritative, `web:42` and another room read 0, and a yesterday-only key reads 0.
- [ ] Run `pnpm --filter=backend test -- playback`; confirm the missing helper and old read/write behavior fail as expected.
- [ ] Implement the helper, update `telegramActor`, `resolvePlayNextLabel`, and `/mystats` to share it. Leave Telegram-only callback payloads/member lookups and inline deduplication keys unchanged. Update existing controller fixtures/assertions for namespaced IDs; do not change reply strings for real Telegram users. Preserve numerical admin lookups and unknown requester handling.
- [ ] Implement the quota bridge: compute the date once per operation; read the new key first (`undefined` means absent, not `0`); if absent and the ref decodes as Telegram, read the old key for the same room and date. `record` writes only the new key from that same read, with the existing local-midnight-plus-60-seconds expiry. Do not delete the legacy key, add the two counts, or change admin exemptions or unlimited-room counting. This bridge does not add distributed atomicity beyond the existing counter.
- [ ] Run `pnpm --filter=backend test -- playback`; expect all playback tests to pass. Commit the app cutover (`refactor(backend): namespace Telegram participant references`). Do not deploy until Task 2 is in the same release.

### Task 2: Migrate room storage and existing identities on both providers

**Interfaces:** `Room.chatId: string | null`, `Room.shareCode: string | null` (unique when non-null), `Room.ownerUserRef: string | null`. `PlaybackService.addRoom(roomID: string, chatId: string | null, threadId: number | null, name: string): Promise<void>` keeps its existing behavior of creating default features. Existing chat lookup methods still accept a non-null chat ID. Future owner assignment uses `ownerUserRef`; do not add a public creator endpoint or a default owner now.

- [ ] Add `scripts/fixtures/stage-2-before.sql` with a populated pre-upgrade root room and topic for chat `-100`, a device, feature, queue, two requests (one requester `9007199254740993`, one null), one linked completed playback session, and votes containing a decimal ID, an empty ID, and an already namespaced ref. Supply explicit IDs and required timestamps. Use the same fixture for both providers.
- [ ] Add `scripts/test-stage-2-upgrade.mjs` following the compiled-client setup in `scripts/test-database.mjs`. Against the upgraded fixture assert the same room links and child rows, `shareCode` and `ownerUserRef` null, the large requester ID now exactly `telegram:9007199254740993`, the null requester still null, the numeric vote prefixed, and empty/already-prefixed votes unchanged. Assert `getRequesterOverview(roomId, 'telegram:9007199254740993', 'all')` retains one request and one completed session; assert the existing linked request ID and queue ID are unchanged. Exercise duplicate-vote rejection with the migrated vote and the matching actor. Delete a separate disposable room to verify the existing cascade path.
- [ ] Extend `scripts/test-database.mjs`: use the current one-argument `PlaybackService` constructor, use namespaced IDs for newly written test votes/requests, create two chatless rooms with default features, and confirm duplicate non-null `shareCode` values fail with `P2002`. Preserve the existing uniqueness test for duplicate linked topic rooms; do not introduce new uniqueness semantics for root Telegram rooms as part of this migration. Ensure cleanup covers every test room.
- [ ] Prove RED by deploying the **current** migrations to a disposable SQLite file, loading the fixture, building the current client, and running the upgrade assertions before adding migrations; expect missing storage or backfill assertions to fail. Repeat the before/after sequence using disposable PostgreSQL. Use `pnpm --filter=backend exec prisma db execute --schema <provider-schema> --file scripts/fixtures/stage-2-before.sql` inside the backend package context with explicit disposable `DATABASE_PROVIDER`/`DATABASE_URL`. Retain the fixture-loaded databases across the upgrade step; don't reseed afterwards.
- [ ] Edit the canonical schema and run `pnpm --filter=backend db:sync`. Add both `20261124000000_web_room_identity` migrations, leaving previous migrations untouched. PostgreSQL uses an in-place nullable-column migration and a unique share-code index. SQLite uses the generated table-rebuild pattern with foreign-key enforcement disabled **before** the rebuild transaction and restored after commit; copy every original `Room` column, recreate the existing chat/topic index, and check child rows and foreign keys during verification. Keep IDs and timestamps intact. Backfill only nonempty all-ASCII-decimal legacy values in `Vote.userId` and `SongRequest.requesterId` (`~ '^[0-9]+$'` in PostgreSQL; nonempty and `NOT GLOB '*[^0-9]*'` in SQLite); use text concatenation, not integer casts. Preserve null, empty strings, and other nonnumeric refs. Include the data update in the provider migration transaction.
- [ ] Widen `PlaybackService.addRoom` as above; leave Telegram call sites and gateway event contracts unchanged. Audit generated nullable `chatId` consumers and retain the existing notifier guards. Do not route chatless rooms via a Telegram lookup.
- [ ] For **each** provider: export explicit disposable database settings, run `pnpm --filter=backend db:check`, `db:generate`, `db:deploy`, and `build`; then `pnpm --filter=backend exec node scripts/test-stage-2-upgrade.mjs` and `pnpm --filter=backend test:database`. All must exit 0; verify SQLite `PRAGMA foreign_key_check` returns no rows. Also run `db:deploy` and `test:database` on a separate fresh database per provider to prove clean installs. Do not report a provider verified without having run it.
- [ ] Commit migration, persistence changes, and integration fixtures (`feat(backend): support room and participant identity migration`).

### Task 3: Document and verify the release gate

- [ ] Document in `docs/database.md`: stop all old writers; back up the database and preserve Redis counters; validate on a disposable copy; deploy the migrations and new code together; smoke-test linked room lookup and requester stats before reopening traffic. An app-only rollback is unsafe after the backfill. Restore the pre-upgrade database and corresponding cache state before running the old build, accounting for writes after cutover. Never rehearse against the production URL.
- [ ] Update `docs/analytics.md` and `AGENTS.md`: stored refs are namespaced; `/mystats` is still Telegram-only; chatless rooms and optional invite/owner fields are storage only in Stage 2. Document the Redis fallback and its natural daily expiry.
- [ ] Run `pnpm --filter=backend lint`, `pnpm --filter=backend test`, `pnpm --filter=backend build`, `pnpm --filter=backend db:check`, and `git diff --check`; expect all to exit 0. Report both provider upgrade results and whether a separate Telegram test-room smoke check was run. Commit docs (`docs: document Stage 2 identity cutover`).
