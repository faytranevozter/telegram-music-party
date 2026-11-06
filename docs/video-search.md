# Backend search

The historical `YTMusicService` name remains for dependency injection. Search now
uses **youtubei.js 18.3.0** with **song-only YouTube Music search by default**
(`client.music.search(query, { type: 'song' })`), not homepage-initialized
`ytmusic-api`. The unused `getSong` method and `ytmusic-api` dependency were
removed. There is no homepage initialization during Nest startup.

## Contract and behavior

- Results have `videoId`, `title`, nullable `artistName`, nullable `channelName`,
  nullable `durationSeconds`, and nullable `thumbnailUrl`. IDs/titles are
  required, duplicate IDs are removed, and only the first 20 valid results are
  returned; no continuations are fetched.
- Song mode accepts only YouTube Music audio tracks (`item_type: "song"`,
  `MUSIC_VIDEO_TYPE_ATV`), so UGC covers and music videos stay out. Multiple
  artists are joined for display. `artistName` is real YouTube Music artist
  metadata and is recorded in artist analytics.
- `#video <query>` opts into ordinary YouTube video search (classic Video nodes
  and video LockupView nodes) for that one query. Video mode is display-only for
  channels: a channel is **not** an artist identity, so artist analytics stay
  empty and labels read `Channel: …`. Song mode labels read `Artist: …`.
- Video search is gated per room by the `allowVideoSearch` feature (default off).
  The inline handler checks the user's last known room; when the room is missing
  or the flag is off, `#video` returns a short notice instead of results.
  Plain queries always stay song-only.
- Missing artist/channel labels display `Unknown artist`; missing duration
  displays `Duration unavailable`; missing thumbnails are omitted. Non-HTTPS
  thumbnail URLs are discarded.
- Lazy session creation uses `generate_session_locally: true` and
  `retrieve_player: false`. Each initialization/search operation has an 8-second
  deadline; HTTP requests also have abort deadlines. The first uncached query
  can therefore take up to roughly 16 seconds including initialization.
  Late promise settlement is observed by the race, not left unhandled.
- Initialization failure does not prevent Nest startup. Provider failures are
  logged by category only (initialization, timeout, rate-limit, network,
  malformed), returning an empty result. Unexpected normalization/programming
  errors and cache errors are not mislabeled as provider outages.
- Input is trimmed, whitespace-collapsed, and capped at 200 characters. Positive
  normalized-query results use existing Keyv storage for 30 seconds. Identical
  in-flight queries share work; each backend process allows four concurrent
  distinct queries. A provider outage pauses new searches for five seconds,
  or 30 seconds for HTTP 429. There are no automatic retries. These are local
  admission limits, not a distributed quota or a guarantee against upstream
  blocking.
- Valid inline queries always get an answer, including short/empty queries and
  outages. Telegram's personal cache is five seconds for empty results and
  30 seconds otherwise. The callback payload cache retains its ten-minute TTL,
  is awaited before answering, and uses `songs:v3:` / `song:v3:` keys to avoid
  interpreting pre-upgrade records as the new contract. Old inline links expire
  safely and must be regenerated after an upgrade.

## Configuration

Search mode is not an environment variable.

- **Default:** song-only YouTube Music results for every inline query.
- **Per-query override:** type `#video <query>` in inline mode. The token is
  stripped before searching and applies only to that query.
- **Room permission:** `/config` → **Search → Video Search** toggles the
  `Feature.allowVideoSearch` column (default `false`). Video results are denied
  unless the user's last known room has it enabled.
- **Cache:** normalized cache keys include the result type, so song and video
  results never share an entry.
- **Migration:** `20261107120000_add_allow_video_search` adds the boolean column
  with a `false` default for both PostgreSQL and SQLite.

There is no persistent per-user search preference and no env-based switch.

## CommonJS and packaging

The backend still compiles to CommonJS. A fixed native dynamic import boundary
loads the ESM-only dependency without TypeScript rewriting it to `require()`.
The version is pinned and included in production dependencies. Verify the actual
pruned Node 24 Alpine image, not just TypeScript compilation:

```sh
docker build -f apps/backend/Dockerfile --build-arg DATABASE_PROVIDER=sqlite \
  -t telegram-music-party:cloud-search-local .
docker run --rm --network none --entrypoint node \
  telegram-music-party:cloud-search-local -e '
  const {YTMusicService}=require("./dist/platform/yt-music.service.js");
  new YTMusicService({}).createClient().then(client=>{
    if(typeof client.search!=="function" || typeof client.music?.search!=="function") throw Error("missing search");
    console.log("Packaged CommonJS/ESM initialization OK");
  }).catch(error=>{console.error(error);process.exitCode=1});'
```

This overrides the migration/startup entrypoint and disables networking; it does
not start a bot, touch a database, or contact YouTube. The regular Docker build
exercises `pnpm deploy --legacy --prod` and runtime dependency pruning.

## Approval-gated follow-up

### Local live verification (2026-11-06, video-mode build)

Following explicit approval to verify locally, real searches passed both from the
built CommonJS backend on the host and from the pruned Node 24 Alpine Docker
image, without starting the bot or accessing production. These measurements were
taken with the earlier ordinary-video mode:

- `Justin Bieber Baby`: 20 unique results; first ID `kffacxfA7G4`, channel
  `Justin Bieber`, duration 220 seconds, HTTPS thumbnail. Host: 1,404 ms;
  Docker: 1,795 ms (including first-use initialization).
- `Rick Astley Never Gonna Give You Up`: 20 unique results; first ID
  `dQw4w9WgXcQ`, channel `Rick Astley`, duration 214 seconds, HTTPS thumbnail.
  Host: 669 ms; Docker: 511 ms.
- Repeated host queries returned identical cached results. The backend suite
  passed all 135 tests, including inline article/keyboard/cache contracts,
  Add to Queue / Play Next callback behavior, provider failures and timeouts.
  ESLint and TypeScript checks also passed.

These are local provider and mocked Telegram integration checks, not a live
Telegram bot playback test or evidence of production/cloud behavior. No service
was deployed, no production database was accessed, and no Telegram messages were
sent. Deployment is owned by the user; do not deploy on their behalf.

The song-only follow-up is covered by unit tests (song normalization, artist
labelling, analytics, and both queue actions) but has not been live-searched yet.
A local live check should confirm that `type: 'song'` returns audio tracks with
artist names on the target network before production rollout.

No live YouTube smoke test, SSH, production deployment/restart, secrets, or
Telegram gallery actions are authorized by the implementation alone.

Proposed deployment candidate: tag the verified image as
`ghcr.io/faytranevozter/telegram-music-party:1.10.0-sqlite-cloud-search` (confirm
the host architecture before publishing an architecture-matched image). After
explicit approval, publish that tag, inspect `ubuntu@tencent-dev`'s current
`music-party-backend-1` image, health and compose configuration, record its exact
rollback digest, and change **only** the backend image to the approved immutable
candidate digest. Preserve all existing volumes, environment, ports and proxy
configuration. Recreate only that backend once using its actual compose service
name. No schema change is included; if existing startup migration checks would
apply unrelated pending migrations, stop rather than apply them. Verify the
running digest, health and bounded logs before testing through the approved
`https://music.ytparty.my.id` / Telegram surface.

Production checks: `Justin Bieber Baby` and `Rick Astley Never Gonna Give You Up`
must return distinct valid song IDs with artist labels, optional durations and
thumbnails; also check no-results, bounded provider-error behavior, Add to Queue,
and Play Next without repeated restarts. Cloud compatibility is based on the
plan's isolated Tencent probe, not a new live measurement from this worktree.

Only after authorized deployment and successful verification, resume genuine
captures in `https://web.telegram.org/k/#@xmsc_bot` and
`https://web.telegram.org/k/#-4333051984`. Do not inspect any other chats or
fabricate captures. Preserve the existing gallery and popup work. If registration
is required, use the current code recorded in the agreed implementation plan.
