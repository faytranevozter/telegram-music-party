# Backend video search

The historical `YTMusicService` name remains for dependency injection, but search
now uses **youtubei.js 18.3.0 ordinary YouTube video search**, not YouTube Music.
The unused `getSong` method and `ytmusic-api` dependency were removed. There is no
music-search fallback and no homepage initialization during Nest startup.

## Contract and behavior

- Results have `videoId`, `title`, `channelName`, nullable `durationSeconds`, and
  nullable `thumbnailUrl`. IDs/titles are required, duplicate IDs are removed,
  and only the first 20 valid videos are returned; no continuations are fetched.
- Both classic Video nodes and video LockupView nodes from the pinned release
  are normalized. Missing channel labels display `Unknown channel`. Missing
  duration displays `Duration unavailable`; missing thumbnails are omitted.
- A channel is **not an artist identity**. Inline messages explicitly label it
  as a channel. Existing artist analytics receive an empty/unknown artist rather
  than a channel-derived artist claim; no schema changes are required.
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
  blocking. No new persistence or database configuration is needed.
- Valid inline queries always get an answer, including short/empty queries and
  outages. Telegram's personal cache is five seconds for empty results and
  30 seconds otherwise. The callback payload cache retains its ten-minute TTL,
  is awaited before answering, and uses `songs:v2:` / `song:v2:` keys to avoid
  interpreting pre-upgrade artist-shaped records as the new contract. Old inline
  links expire safely and must be regenerated after an upgrade.

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
    if(typeof client.search!=="function") throw Error("missing search");
    console.log("Packaged CommonJS/ESM initialization OK");
  }).catch(error=>{console.error(error);process.exitCode=1});'
```

This overrides the migration/startup entrypoint and disables networking; it does
not start a bot, touch a database, or contact YouTube. The regular Docker build
exercises `pnpm deploy --legacy --prod` and runtime dependency pruning.

## Approval-gated follow-up

### Local live verification (2026-11-06)

Following explicit approval to verify locally, real searches passed both from the
built CommonJS backend on the host and from the pruned Node 24 Alpine Docker
image, without starting the bot or accessing production:

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
must return distinct valid IDs and display-channel labels, optional durations and
thumbnails; also check no-results, bounded provider-error behavior, Add to Queue,
and Play Next without repeated restarts. Cloud compatibility is based on the
plan's isolated Tencent probe, not a new live measurement from this worktree.

Only after authorized deployment and successful verification, resume genuine
captures in `https://web.telegram.org/k/#@xmsc_bot` and
`https://web.telegram.org/k/#-4333051984`. Do not inspect any other chats or
fabricate captures. Preserve the existing gallery and popup work. If registration
is required, use the current code recorded in the agreed implementation plan.
