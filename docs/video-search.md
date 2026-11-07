# Backend search

The historical `YTMusicService` name remains for dependency injection. Inline
search has two sources:

- **Songs (default):** Piped's keyless `filter=music_songs` search, because
  YouTube Music itself is region-blocked on the current Tencent host.
- **Videos (`#video`):** youtubei.js 18.3.0 ordinary YouTube video search.

The unused `getSong` method and `ytmusic-api` dependency were removed. There is
no homepage initialization during Nest startup.

## Contract and behavior

- Results have `videoId`, `title`, nullable `artistName`, nullable `channelName`,
  nullable `durationSeconds`, and nullable `thumbnailUrl`. IDs/titles are
  required, duplicate IDs are removed, and only the first 20 valid results are
  returned; no continuations are fetched.
- Song mode calls a Piped API with `filter=music_songs`. Only `type: "stream"`
  entries with a valid `/watch?v=` ID and title are accepted; `uploaderName`
  becomes `artistName` and thumbnails resolve to `i.ytimg.com`. Piped already
  returns YouTube Music audio tracks, so no music-video heuristic is applied.
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
- Song search is a keyless HTTPS request with an 8-second deadline; it does not
  create a youtubei session. Video search lazily creates a session with
  `generate_session_locally: true` and `retrieve_player: false`, with 8-second
  initialization/search deadlines and abortable HTTP requests. Late promise
  settlement is observed by the race, not left unhandled.
- Song-provider and video-initialization failures do not prevent Nest startup.
  Provider failures are logged by category only (initialization, timeout,
  rate-limit, network, malformed), returning an empty result. Unexpected
  normalization/programming errors and cache errors are not mislabeled as
  provider outages.
- Input is trimmed, whitespace-collapsed, and capped at 200 characters. Positive
  normalized-query results use existing Keyv storage for 30 seconds. Identical
  in-flight queries share work; each backend process allows four concurrent
  distinct queries. A provider outage pauses that result type for five seconds,
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

- **Default:** songs from Piped's `filter=music_songs` for every inline query.
  Public Piped instances are best-effort; the ordered fallback list lives in
  `apps/backend/src/config/search.ts` (`SONG_SEARCH_INSTANCES`). No API key is
  required. Replace it with your own Piped deployment for stronger availability.
- **Why not YouTube Music directly:** the production Tencent host is outside
  YouTube Music's service area. The same `music.search(..., { type: 'song' })`
  call returns 20 songs locally but `No results` on that host, and
  `music.youtube.com` answers `YouTube Music is not available in your area`.
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
The YouTube Data API is a possible fallback, but it requires an API key and its
free quota is limited; Piped keeps the current design keyless.

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

### Song source check (2026-11-07)

The song-only follow-up was live-checked during deployment:

- Direct YouTube Music search returned 20 songs from the local workstation but
  `0` from `ubuntu@tencent-dev`. `https://music.youtube.com/` on that host
  answers `YouTube Music is not available in your area`.
- Piped `filter=music_songs` returned 20 songs from the same host for
  `Rick Astley Never Gonna Give You Up`: first ID `lYBUbBu4W08`, artist
  `Rick Astley`, duration 214 seconds. This is why song mode now uses Piped.
- Video mode remains youtubei.js ordinary video search, which already worked
  from this host.
- No YouTube Data API key is used. Its default free quota is 10,000 units/day,
  and `search.list` costs 100 units per call (about 100 searches/day) before a
  quota increase request.

No production search was run through Telegram during this check; the Piped
request was made directly from the host.

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
