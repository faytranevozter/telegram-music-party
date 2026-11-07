# Search API client guide

Base URL: `https://telegram-music-party-search.vercel.app`

Production Vercel Deployment Protection is enabled for this project. Until a
server-to-server access strategy is explicitly configured, ordinary clients may
be stopped by Vercel's protection layer before reaching this API. The bearer
credential below authenticates the function itself; it does **not** bypass
Vercel Deployment Protection. Never attempt to work around protection with a
user's browser/session cookies. Keep backend integration in its own approved
phase.

## Endpoint

`POST /api/search`

Headers:

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer <SEARCH_API_TOKEN>
```

JSON body:

```json
{
  "query": "Rick Astley Never Gonna Give You Up",
  "type": "song"
}
```

`type` is optional and defaults to `song`. Supported values:

- `song` — YouTube Music song results, with `artistName`.
- `video` — ordinary video results, with `channelName`.

The query is trimmed and whitespace-normalized; it must contain 3–200
characters. At most 20 valid, unique YouTube video IDs are returned.

## Success response

HTTP `200`:

```json
{
  "results": [
    {
      "videoId": "lYBUbBu4W08",
      "title": "Never Gonna Give You Up",
      "artistName": "Rick Astley",
      "channelName": null,
      "durationSeconds": 214,
      "thumbnailUrl": "https://..."
    }
  ],
  "requestId": "generated",
  "cached": false
}
```

`artistName` is populated for song searches; `channelName` is populated for
video searches. Optional metadata may be `null`. A valid search with no usable
matches returns `200` and `"results": []`. Provider failure is **not** an empty
success: it uses a non-2xx response.

## Error responses

JSON error body: `{ "error": "error_code", "requestId": "..." }` when a
request ID has been created.

| HTTP | Error code | Meaning |
|---|---|---|
| 400 | `invalid_json`, `invalid_query`, `invalid_type` | Request shape or input is invalid |
| 401 | `unauthorized` | Bearer token missing/incorrect or function secret not configured |
| 405 | `method_not_allowed` | Only POST is supported |
| 413 | `body_too_large` | Body exceeds 4 KiB |
| 415 | `unsupported_media_type` | Content-Type must be JSON |
| 429 | `rate_limited` | Per-instance best-effort limiter rejected the request |
| 502 | `provider_unavailable` | Provider/library failed or response was unusable |
| 503 | `provider_rate_limited` | Upstream provider rate-limited the function |
| 504 | `provider_timeout` | Provider exceeded the 12-second handler deadline |

## Example calls

Use a secret environment variable; do not inline or log the token:

```sh
curl --fail-with-body \
  -X POST 'https://telegram-music-party-search.vercel.app/api/search' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${SEARCH_API_TOKEN}" \
  -d '{"query":"Rick Astley Never Gonna Give You Up","type":"song"}'
```

Video example:

```sh
curl --fail-with-body \
  -X POST 'https://telegram-music-party-search.vercel.app/api/search' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${SEARCH_API_TOKEN}" \
  -d '{"query":"Daft Punk music video","type":"video"}'
```

The endpoint uses in-memory cache and rate limits per warm function instance;
these are not global quotas. Don't send secrets in query strings. Logs omit
query text, authorization values, cookies, and raw provider errors.
