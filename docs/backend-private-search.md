# Backend private search (disabled by default)

Both songs and room-authorized `#video` queries can use the Vercel service.
No Piped or local fallback is used while enabled. Video results come from
YouTube Music's video search, not general YouTube search parity. Missing
display metadata stays null; never infer verified artists/channels from it.

## Configuration

Set `YTMUSIC_SEARCH_ENABLED=true`, a fixed HTTPS `YTMUSIC_SEARCH_URL`,
`YTMUSIC_SEARCH_TOKEN`, and, if Vercel Deployment Protection is enabled,
`YTMUSIC_SEARCH_BYPASS_SECRET`. This is a supported automation bypass secret,
**not** a Vercel account access token, OIDC token or browser cookie. Keep both
secrets in backend runtime secret storage. Do not set them in the extension,
Telegram messages, URLs, source, screenshots or logs. Rotate independently and
update runtime configuration; revoke the old secret after cutover.

Enabled configuration is validated at startup. Redirects are rejected to avoid
sending secrets to another host. `YTMUSIC_SEARCH_TIMEOUT_MS` defaults to 8000
(100–15000 allowed); one deadline bounds headers and the entire body. Responses
are capped at 128 KiB and 20 unique valid results. No retries are performed.
The function has a single 12-second provider deadline, so this caller may
time out sooner; measure cold-start latency before considering a longer caller
budget. Library work may continue
after a timeout. Do not assume cancellation terminates upstream library work.

Positive results cache for 30 seconds, separately by provider and search type.
Concurrent identical searches are coalesced; four provider operations are
allowed. Failure cooldowns are per type (30 seconds for throttling, otherwise
5 seconds). Failures are typed internally and logged only by category and type;
the Telegram boundary returns a safe empty inline list. Valid empty results are
not cached. HTML login responses are platform protection failures, not songs.

## Acceptance and rollout (separate authorization required)

1. Keep the flag off until an ordinary non-CLI request works with both headers.
   Current live verification used `vercel curl`; it does not prove backend access.
2. Service mocked positive/empty/error tests, total deadline/timer cleanup and
   metadata mapping are included. Video artist metadata is display credit from
   the library, not a verified channel identity. A provider empty array
   alone does not prove health; periodically use a known-positive song/video
   probe. Avoid raw queries in monitoring logs or user-supplied log identifiers.
3. Run backend tests and builds plus the standalone function tests. Check
   quotas, function invocation/CPU costs, retention and global request limits;
   the service's cache/rate limits are per instance, not a global budget. Choose
   spend alerts for the actual account plan before enabling traffic.
4. Only after approval, verify from the real Tencent/container network using
   ordinary HTTPS; SSH and runtime secret provisioning need explicit permission.
   Test a known-positive song, a video, invalid credentials and Telegram's room
   video gate. Record status/count/latency, never tokens or raw provider errors.
5. Enable and monitor typed failures and latency. Roll back by disabling the
   flag and restarting/redeploying config as necessary. This restores previous
   youtubei.js behavior; it does NOT fix the Tencent regional restriction.
   Never introduce Piped as rollback. No playback/extension/schema changes.
