# Private YouTube Music search function

Vercel Node.js Function using the original, pinned `ytmusic-api@5.3.1` package.
The configured region is `iad1` (US East), and a real deployed song search has
been verified there. This does not establish availability from other Vercel
regions or the Tencent backend's network path.

## Deployment and verification

### Git auto-deployment

The Vercel project is connected to
`faytranevozter/telegram-music-party` with Root Directory
`apps/ytmusic-search`. Pushes to `main` deploy production; other branches and
pull requests create protected previews. PR #15 must merge before `main`
contains this service. Build command is `pnpm build`, install command is
`pnpm install --frozen-lockfile`, and output directory is `public`.
The bearer secret is production-only; preview deployments intentionally do not
inherit it. GitHub deployment statuses and PR comments are enabled.

1. Vercel project `telegram-music-party-search` uses this directory as its root.
2. The encrypted production `SEARCH_API_TOKEN` is configured in Vercel.
   Generate and manage a strong random token out-of-band; do not put it in source,
   a URL, a client, or logs. Store the same token in the backend secret environment.
3. Build with `pnpm install --frozen-lockfile` and `pnpm build`; run `pnpm test`.
4. Production URL: `https://telegram-music-party-search.vercel.app/api/search`.
   Function runs in `iad1`. Deployment protection is enabled on Vercel, so CLI
   verification used `vercel curl` to bypass Vercel protection before the
   endpoint's own bearer authentication.
5. Verified a real search for “Rick Astley Never Gonna Give You Up”; it returned
   the expected Rick Astley track (`lYBUbBu4W08`) among song results. Also verified
   invalid credentials return 401 and invalid query returns 400. Do not treat
   vague nonsense strings as empty-result tests: YouTube Music may fuzzy-match.
6. Backend integration is a separate, not-yet-authorized/deployed step. Keep
   Vercel protection configuration under review: an external backend cannot
   bypass Vercel authentication unless a supported noninteractive bypass is
   explicitly configured and its secret is managed securely. The endpoint's
   bearer secret alone does not bypass platform deployment protection.

## API

`POST /api/search`, `Content-Type: application/json`, `Authorization: Bearer …`

Request: `{ "query": "artist song", "type": "song" }` (type is optional, defaults to `song`; accepted values: `song`, `video`; normalized query is 3–200 characters).
Success: `{ "results": [{ "videoId", "title", "artistName", "channelName", "durationSeconds", "thumbnailUrl" }], "requestId", "cached" }`. Song results have artist metadata; video results have channel metadata.
Provider errors are non-2xx and distinct from a successful empty `results` array.
Responses never include query text, credentials, cookies, or provider exception details.

The in-memory cache and rate limiter are per warm instance, not global/distributed;
deployments with more than one concurrent instance need platform-level request
limits or shared storage for a global quota.
The platform's per-function duration is capped at 30 seconds; handler's provider
deadline is 12 seconds. The library API does not currently expose cancellation,
so timeout bounds the response but cannot guarantee cancellation of its internal
HTTP work. Logs contain outcome categories/counts and latency, not query text.

The bearer token authenticates callers but the endpoint remains internet-facing;
an in-process limiter is only best-effort and not a global quota. Before use,
verify current Vercel pricing and
limits and review YouTube/YouTube Music terms and the unofficial library's
availability/security posture. Rotating the token requires updating both secret
stores; disable backend opt-in immediately if credentials or endpoint are at risk.
