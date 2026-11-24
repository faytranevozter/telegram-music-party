# Web Clients, Stage 1: Neutral Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move control-permission, vote, play-next quota and song-request logic out of the Telegram controllers into transport-neutral services, and take the Telegraf bot out of `PlaybackService`, with no change in bot behavior.

**Architecture:** New injectable services under `apps/backend/src/app/playback/core/` take a plain `Actor` and a room object and return discriminated-union results. `PlaybackTelegramController` builds the actor, calls the service, and formats the Telegram reply. Telegram message sending moves to a `TelegramNotifier`, which the gateway calls only for rooms that have a `chatId`.

**Tech Stack:** NestJS, nestjs-telegraf/Telegraf, Prisma, Keyv (Redis), Jest.

**Spec:** `docs/superpowers/specs/2026-11-23-web-clients-design.md` (Stage 1). Stages 2 to 4 get their own plans after this one lands.

## Global Constraints

- Telegram bot behavior does not change. Reply texts, callback answers, Redis keys and analytics rows stay identical.
- Services in `core/` must not import `telegraf`, `nestjs-telegraf`, or build Telegram HTML.
- In stage 1 the Telegram actor's `userRef` is `String(telegramUserId)` with no prefix. Redis keys (`playnext-daily:<roomId>:<userRef>:<date>`), `Vote.userId` and `SongRequest.requesterId` therefore stay byte-identical. Stage 2 adds the `telegram:` prefix in one place (`telegramActor`) together with the data migration.
- Deviation from the spec's actor shape: `isAdmin` is a lazy `() => Promise<boolean>`, not a boolean. Today `getChatMember` is called only when an admin-only feature is hit. An eager boolean would add a Telegram API call to every command.
- Backend style: 4-space indent, Prettier `singleQuote: true`, `trailingComma: "all"`, no final newline.
- Run tests with `pnpm --filter=backend test -- <pattern>`. The `src/` path alias works in specs.
- Existing specs (`playback.search.controller.spec.ts`, `playback.gateway.spec.ts`, `playback.service.spec.ts`, `playback.stats.controller.spec.ts`, analytics specs) keep their assertions. Only their construction wiring may change.

## Review Focus

- **Private chat admin:** a user in a private chat is an admin and `getChatMember` is never called. Test in Task 1.
- **Lazy admin check:** a control without an admin-only flag, or one that is disabled, never triggers `isAdmin()`. Test in Task 1.
- **Room without a Feature row:** every control is allowed, queue limit defaults to 10, minimum votes defaults to 5. Tests in Tasks 1, 3 and 5.
- **Analytics failure:** if `recordRequest` throws, the song is still queued with no request ID. If the queue write throws, the request is marked failed and the error is rethrown. Tests in Task 5.
- **Room without a chat:** a `playback-notification` for a room with an empty `chatId` sends nothing and does not throw, and a `queue-unavailable` report still removes the track from the queue. Tests in Task 6.

## File Structure

- Create `apps/backend/src/app/playback/core/actor.ts`: `Actor` type.
- Create `apps/backend/src/app/playback/core/control-access.ts`: `authorizeControl` policy.
- Create `apps/backend/src/app/playback/core/vote.service.ts`: `VoteService`.
- Create `apps/backend/src/app/playback/core/play-next-quota.service.ts`: `PlayNextQuotaService`.
- Create `apps/backend/src/app/playback/core/song-label.ts`: `describeSongPlain`.
- Create `apps/backend/src/app/playback/core/queue-request.service.ts`: `QueueRequestService`.
- Create `apps/backend/src/app/playback/telegram-actor.ts`: `telegramActor(ctx, chatId)`.
- Create `apps/backend/src/app/playback/telegram-notifier.ts`: `TelegramNotifier`.
- Create `apps/backend/src/app/playback/testing/controller-harness.ts`: shared controller test setup.
- Modify `playback.controller.ts`, `playback.service.ts`, `playback.gateway.ts`, `playback.module.ts`, and the existing specs' wiring.

---

### Task 1: Actor and control-access policy

**Files:**
- Create: `apps/backend/src/app/playback/core/actor.ts`, `core/control-access.ts`, `telegram-actor.ts`
- Test: `core/control-access.spec.ts`, `telegram-actor.spec.ts` (same folders)

**Interfaces:**
- Produces:
  - `type Actor = { userRef: string; displayName: string; source: 'telegram' | 'web'; isAdmin(): Promise<boolean> }`
  - `type ControlName = 'next' | 'previous' | 'radio' | 'refresh' | 'mute' | 'unmute' | 'volume'`
  - `type ControlAccess = 'ok' | 'disabled' | 'admin-only'`
  - `authorizeControl(feature: Feature | null, control: ControlName, actor: Actor): Promise<ControlAccess>`
  - `telegramActor(ctx: Context, chatId: string): Actor`

- [ ] **Step 1: Write failing tests in `core/control-access.spec.ts`.** Use a helper `actor(isAdmin: boolean)` returning an `Actor` whose `isAdmin` is a `jest.fn`. Cases:
  - `authorizeControl(null, 'next', a)` resolves `'ok'`.
  - `{ nextCommand: false }` resolves `'disabled'` and `isAdmin` is not called.
  - `{ nextCommand: true, nextOnlyAdmin: true }` with a non-admin resolves `'admin-only'`, and with an admin resolves `'ok'`.
  - `{ nextCommand: true, nextOnlyAdmin: false }` resolves `'ok'` and `isAdmin` is not called.
  - One enabled/disabled check each for `previous`, `radio`, `refresh` (each with its own `*OnlyAdmin` flag), and for `mute` (`muteCommand`), `unmute` (`unmuteCommand`), `volume` (`volumeCommand`). `mute`, `unmute` and `volume` never return `'admin-only'`.
- [ ] **Step 2: Write failing tests in `telegram-actor.spec.ts`.** `userRef` is `String(ctx.from.id)`. A private chat (`ctx.chat.type === 'private'`) gives `isAdmin()` true with `ctx.telegram.getChatMember` not called. A group where `getChatMember` returns `{ status: 'creator' }` or `'administrator'` gives true, and `'member'` gives false. Two calls to `isAdmin()` call `getChatMember` once.
- [ ] **Step 3: Run both specs.** Run `pnpm --filter=backend test -- control-access telegram-actor`. Expected: FAIL, modules not found.
- [ ] **Step 4: Implement `actor.ts`, `authorizeControl`, and `telegramActor`.** `authorizeControl` maps each control to its enabled flag and optional admin-only flag. It returns `'ok'` when `feature` is null, `'disabled'` when the enabled flag is not `=== true`, and calls `actor.isAdmin()` only when the admin flag is `=== true`. `telegramActor` calls `ctx.telegram.getChatMember(chatId, userId)` with `userId = ctx.from?.id || 0`, memoizes the result, and sets `displayName` from `first_name` plus `last_name`.
- [ ] **Step 5: Run the specs.** Expected: PASS.
- [ ] **Step 6: Commit.** `git add apps/backend/src/app/playback && git commit -m "feat(backend): add Actor and control access policy"`

### Task 2: Controls use the policy, behind characterization tests

**Files:**
- Create: `testing/controller-harness.ts`, `playback.controls.controller.spec.ts`
- Modify: `playback.controller.ts` (`next`, `prev`, `autoplayAccessError`/`checkAutoplayAccess`, `confirmAutoplay`, `mute`, `unmute`, `volumeUp`, `volumeDown`, remove `isRoomAdmin` if unused), `playback.search.controller.spec.ts` (setup only)

**Interfaces:**
- Consumes: `authorizeControl`, `telegramActor` from Task 1.
- Produces: `buildController(overrides?: Partial<Deps>)` returning `{ controller, cache, gateway, playback, analytics, ytmusic }`, where `cache` is an in-memory `Keyv` and every dependency is a `jest.fn` mock. Later tasks add their new services here and nowhere else.

- [ ] **Step 1: Write `testing/controller-harness.ts`** by lifting the `setup()` wiring from `playback.search.controller.spec.ts`, with the controller's current five constructor arguments. Switch that spec's `setup()` to use the harness. Its assertions stay as they are.
- [ ] **Step 2: Run `pnpm --filter=backend test -- playback.search`.** Expected: PASS, so the harness is proven before anything changes.
- [ ] **Step 3: Write characterization tests in `playback.controls.controller.spec.ts` against the current controller.** Build `ctx` with `chat: { id: -100, type: 'supergroup' }`, `from: { id: 7 }`, `reply: jest.fn()`, and both `ctx.getChatMember` and `ctx.telegram.getChatMember` as the same mock, so the tests pass before and after the refactor. Read the handlers at `playback.controller.ts` lines 870 to 1354 and copy their exact reply strings. Cases:
  - `next` disabled replies `'⚠️ This feature is currently disabled.'` and `gateway.nextCommand` is not called.
  - `next` with `nextOnlyAdmin` and a `'member'` replies `'⚠️ This feature is available for admin only.'`; with `'administrator'` it calls `gateway.nextCommand('room')`.
  - `next` in a private chat with `nextOnlyAdmin` calls the gateway and never calls `getChatMember`.
  - `next` with `Feature: null` calls the gateway.
  - `prev` disabled, and `prev` admin-only for a member.
  - `radio` admin-only for a member sends no confirmation prompt.
  - `mute` and `volumeUp` disabled each reply with their existing message and do not call the gateway.
- [ ] **Step 4: Run the new spec against the unchanged controller.** Run `pnpm --filter=backend test -- playback.controls`. Expected: PASS.
- [ ] **Step 5: Refactor the handlers in `playback.controller.ts`.** Build `const actor = telegramActor(ctx, chatId)` and call `authorizeControl(room.Feature, '<control>', actor)`. Map `'disabled'` and `'admin-only'` to the existing reply or callback answer. `autoplayAccessError` and `checkAutoplayAccess` take a `ControlName` instead of the three booleans. Keep `ensureConfigAdmin`, `register` and `unregister` as they are.
- [ ] **Step 6: Run `pnpm --filter=backend test -- playback`.** Expected: PASS, with the characterization assertions unchanged.
- [ ] **Step 7: Commit.** `git commit -am "refactor(backend): route control access through authorizeControl"` (include the new files).

### Task 3: VoteService

**Files:**
- Create: `core/vote.service.ts`, `core/vote.service.spec.ts`
- Modify: `playback.controller.ts` (`vote_next`), `testing/controller-harness.ts`, `playback.controls.controller.spec.ts` (add `vote_next` cases), `playback.module.ts`

**Interfaces:**
- Consumes: `Actor`, `PlaybackService.addVote`, `PlaybackGateway.nextCommand`.
- Produces:
  - `type VoteResult = { status: 'already-voted' } | { status: 'passed' } | { status: 'counted'; count: number; required: number }`
  - `VoteService.castNextVote(room: { id: string; Feature: Feature | null; Votes: Array<{ userId: string }> }, actor: Actor): Promise<VoteResult>`

- [ ] **Step 1: Add characterization tests for `vote_next` to `playback.controls.controller.spec.ts`**, with `playback.getDevicesByChatId` returning a room with `Votes`. The already-voted reply is `"Nice try, DJ—but you've already voted! Let's see what the others pick 🎧"`, with no `addVote` and no `nextCommand`. With `minimumVotes: 3` and 1 existing vote, `addVote('room', '7')` runs and the reply contains `2`. With 2 existing votes, `gateway.nextCommand('room')` runs, the reply contains `'Minimum votes reached'`, and `addVote` is not called. With `Feature: null` the required count is 5. Run it against the unchanged controller. Expected: PASS.
- [ ] **Step 2: Write failing `vote.service.spec.ts`** asserting the same four outcomes as results: `already-voted`, `counted` with `{ count: 2, required: 3 }`, `passed` with the gateway call and no `addVote`, and `required: 5` when `Feature` is null.
- [ ] **Step 3: Run it.** Expected: FAIL.
- [ ] **Step 4: Implement `VoteService`** with the existing order: already-voted check by `v.userId === actor.userRef`, then pass check `Votes.length + 1 >= required`, then `addVote`. The pass branch does not store the final vote, as today.
- [ ] **Step 5: Inject `VoteService` into the controller, rewrite `vote_next` to call it, and keep the random reply texts in the controller.** Add it to the harness and to `PlaybackModule` providers.
- [ ] **Step 6: Run `pnpm --filter=backend test -- playback`.** Expected: PASS.
- [ ] **Step 7: Commit.** `git commit -am "refactor(backend): extract VoteService"`

### Task 4: PlayNextQuotaService

**Files:**
- Create: `core/play-next-quota.service.ts`, `core/play-next-quota.service.spec.ts`
- Modify: `playback.controller.ts` (remove `getPlayNextCount`, `incrementPlayNextCount`, `getPlayNextRemaining`, `getLocalDateKey`, `getMillisecondsUntilLocalMidnight` after `grep` confirms nothing else uses them; `resolvePlayNextLabel` calls the service), `testing/controller-harness.ts`, `playback.module.ts`

**Interfaces:**
- Produces: `PlayNextQuotaService` with a constructor taking `@Inject('KEYV_CACHE') cache: Keyv`, and
  - `used(roomId: string, userRef: string): Promise<number>`
  - `remaining(room: { id: string; Feature: Feature | null }, userRef: string): Promise<number | null>` (null when the limit is 0 or there is no Feature)
  - `record(roomId: string, userRef: string): Promise<void>`

- [ ] **Step 1: Write failing `play-next-quota.service.spec.ts`** using `new Keyv()`. `remaining` is null for limit 0 and for `Feature: null`. With limit 3 it is 3, then 2 after one `record`, then 0 and never negative. Two users in one room count separately. The cache key written is `playnext-daily:<roomId>:<userRef>:<local YYYY-MM-DD>`, asserted with `cache.get`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement the service** by moving the five controller helpers' logic unchanged, including the expiry of milliseconds to local midnight plus 60,000.
- [ ] **Step 4: Inject it into the controller.** `resolvePlayNextLabel` passes `String(userId)`. Add it to the harness and `PlaybackModule`.
- [ ] **Step 5: Run `pnpm --filter=backend test -- playback`.** Expected: PASS, including the search spec's Play Next cases.
- [ ] **Step 6: Commit.** `git commit -am "refactor(backend): extract PlayNextQuotaService"`

### Task 5: QueueRequestService

**Files:**
- Create: `core/song-label.ts`, `core/queue-request.service.ts`, `core/queue-request.service.spec.ts`
- Modify: `playback.controller.ts` (`completeAddToQueue`, `completePlayNext`, `describeSong`), `testing/controller-harness.ts`, `playback.module.ts`

**Interfaces:**
- Consumes: `PlayNextQuotaService`, `PlaybackService.getQueues/addToQueue/addPlayNext`, `AnalyticsService.recordRequest/markRequestFailed`, `PlaybackGateway.addToQueueCommand`, `isVideoResult`, `creditLabel`, `formatDuration`.
- Produces:
  - `describeSongPlain(song: Song): { credit: string; duration: string; plain: string }`
  - `type RequestSongResult = { status: 'play-next-disabled' } | { status: 'queue-full' } | { status: 'song-expired'; alreadyQueued: boolean } | { status: 'video-disabled' } | { status: 'duplicate'; song: Song } | { status: 'limit-reached'; used: number; limit: number } | { status: 'added'; song: Song; label: string; requestId?: string }`
  - `QueueRequestService.request(input: { room: { id: string; Feature: Feature | null }; videoId: string; position: 'end' | 'next'; actor: Actor; loadSong: () => Promise<Song | null | undefined> }): Promise<RequestSongResult>`

- [ ] **Step 1: Write failing `queue-request.service.spec.ts`.** Check order matches today's code: `next` with `playNextCommand` not true gives `play-next-disabled`, and `end` ignores that flag. Then queue length at `maxQueueSize` gives `queue-full` (default 10 when `Feature` is null) and `loadSong` is not called. Then `loadSong` returning undefined gives `song-expired` with `alreadyQueued` true when the video is in the queue. Then a video result with `allowVideoSearch` not true gives `video-disabled`. Then a video already queued gives `duplicate`. Then `next` with limit 3 and 3 used gives `limit-reached` for a non-admin, and an admin is never limited and never recorded. Success: `addToQueue` or `addPlayNext` is called with the plain label and request ID, `gateway.addToQueueCommand(roomId, videoId, position, label, requestId)` is called, `recordRequest` gets `source: 'queue'` or `'play_next'` and `requesterId: actor.userRef`, and a non-admin `next` calls `quota.record`. Failure paths: `recordRequest` rejecting still queues with `requestId` undefined and no throw. `addToQueue` rejecting calls `markRequestFailed(requestId)` and rethrows.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `describeSongPlain`** (plain form `"<title> - <credit> [<duration>]"`, duration `'Duration unavailable'` when null) and `QueueRequestService.request`, in the order the specs describe, moving the analytics and queue-write code from `completeAddToQueue`/`completePlayNext` as is. The gateway emit happens inside `request`, before the Telegram message edit. This ordering change is accepted, and the emit no longer depends on the edit succeeding.
- [ ] **Step 4: Rewrite `completeAddToQueue` and `completePlayNext`.** Keep in the controller the `doneKey`/`lockKey` handling, room lookup by chat, cache reads and deletes, and every `answerCbQuery`/`editMessageText` call. Pass `loadSong: () => this.cacheManager.get<Song>(cacheKey)`. `describeSong` becomes `describeSongPlain` plus the `html` field. Map each result status to the reply the old code gave: `queue-full` to `'Queue is full'`, `play-next-disabled` to `'Play Next is disabled in this room'`, `song-expired` to the doneKey/alreadyQueued early returns and then the expired-link edit, `video-disabled` to `refuseVideoSearch`, `duplicate` to doneKey plus the `🔁` edit for `end` or `'This song is already in the queue'` for `next`, `limit-reached` to `Daily Play Next limit reached (used/limit)`, `added` to the existing success texts.
- [ ] **Step 5: Inject the service into the controller, the harness and `PlaybackModule`.** Run `pnpm --filter=backend test -- playback`. Expected: PASS with the search spec assertions unchanged.
- [ ] **Step 6: Commit.** `git commit -am "refactor(backend): extract QueueRequestService"`

### Task 6: TelegramNotifier and bot-free PlaybackService

**Files:**
- Create: `telegram-notifier.ts`, `telegram-notifier.spec.ts`
- Modify: `playback.service.ts`, `playback.service.spec.ts`, `playback.gateway.ts`, `playback.gateway.spec.ts`, `playback.module.ts`

**Interfaces:**
- Produces: `TelegramNotifier` (constructor `@InjectBot() bot: Telegraf<Context>`) with `sendMessage(chatId: string, threadId: number | null, message: string, parseMode?: 'HTML' | 'Markdown'): Promise<void>` and `sendPlaybackNotification(chatId: string, threadId: number | null, notification: PlaybackNotification): Promise<void>`, with bodies moved unchanged from `PlaybackService`.

- [ ] **Step 1: Move the three `sendPlaybackNotification` tests** (`playback.service.spec.ts` around lines 70 to 110) into `telegram-notifier.spec.ts`, building `TelegramNotifier` with the same mocked bot. Run it. Expected: FAIL, module not found.
- [ ] **Step 2: Implement `TelegramNotifier`** by moving `sendMessage` and `sendPlaybackNotification` out of `PlaybackService`. Remove the bot constructor argument, `InjectBot`, `Telegraf`, and any now-unused imports from `PlaybackService`. Fix `playback.service.spec.ts` construction. First `grep` for other `sendMessage` callers and move them if any.
- [ ] **Step 3: Add gateway tests.** In `playback.gateway.spec.ts`, replace the mocked `playbackService.sendPlaybackNotification` with a mocked `telegramNotifier`. Keep the existing assertions. Add: a room with `chatId: ''` triggers no notifier call and does not throw. A `queue-unavailable` report from the admitted device for such a room still calls `removeQueue`.
- [ ] **Step 4: Inject `TelegramNotifier` into `PlaybackGateway` as a third constructor argument.** In `onPlaybackNotification`, keep the `queue-unavailable` removal as is and send only when `room.chatId` is truthy.
- [ ] **Step 5: Register `TelegramNotifier` in `PlaybackModule`.** Run `pnpm --filter=backend test`. Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -am "refactor(backend): move Telegram sending out of PlaybackService"`

### Task 7: Verification and notes

**Files:**
- Modify: `AGENTS.md` (Backend architecture notes)

- [ ] **Step 1: Run the full checks.** `pnpm --filter=backend test`, `pnpm --filter=backend lint`, `pnpm --filter=backend build`. Expected: all pass.
- [ ] **Step 2: Confirm the boundary.** `grep -rn "telegraf" apps/backend/src/app/playback/core` returns nothing, and `grep -n "InjectBot\|Telegraf" apps/backend/src/app/playback/playback.service.ts` returns nothing.
- [ ] **Step 3: Add to `AGENTS.md`** a short "Core services" note: `playback/core/*` is transport-neutral and takes an `Actor`; Telegram formatting stays in `playback.controller.ts`; `TelegramNotifier` owns bot sending; `userRef` is the unprefixed Telegram ID until stage 2.
- [ ] **Step 4: Commit.** `git commit -am "docs: describe neutral core services"`
- [ ] **Step 5: Hand the manual check to your human partner.** With a real bot token, run in a test group: `/register`, `/play`, `/next` (as admin and as member with `nextOnlyAdmin` on), `/vote_next` twice from one user, inline search then Add to Queue and Play Next up to the daily limit, `/radio`, `/mute`, `/config`, `/queue`. Expected: same replies as before the change.

## Self-Review Notes

- Spec Stage 1 coverage: neutral services with an actor (Tasks 1 to 5), bot out of `PlaybackService` and gateway skip for rooms with no `chatId` (Task 6), thin controllers (Tasks 2 to 5), existing specs as safety net plus new unit tests (all tasks), manual bot run (Task 7).
- Deviations recorded: lazy `isAdmin`, gateway emit moved before the Telegram message edit, `userRef` unprefixed until stage 2.
- Not extracted on purpose (YAGNI until stage 3 needs them): config editing, `/info`, `/devices`, register/unregister, stats.
