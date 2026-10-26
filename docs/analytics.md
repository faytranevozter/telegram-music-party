# Song request and playback analytics

Room-scoped analytics for Telegram Music Party. Requests and listening are
separate metrics: a queued song is not evidence that it played.

Analytics starts from rollout. There is no attempt to reconstruct historical
playback from old queues. `/stats` shows the room's coverage start date when data
exists.

## Event definitions

### Song request

Created when the bot accepts a song into the room queue (inline **Add to queue**
or **Play Next**). The durable request row keeps its ID after the disposable
`Queue` row is removed.

| Field | Meaning |
|-------|---------|
| `id` | Durable request ID; reused as the queue row ID for correlation |
| `roomId` | Room the request belongs to |
| `requesterId` | Telegram user ID, when known |
| `videoId` | Canonical YouTube video ID |
| `title`, `artist` | Display snapshots at request time |
| `source` | `queue` or `play_next` |
| `outcome` | `queued`, `started`, `played`, `skipped`, or `failed` |
| `requestedAt` | Acceptance time |

Only accepted requests are recorded in request counts. A queue insert failure
marks the request `failed`, and `/stats` reports failed attempts separately
instead of counting them as requested songs.

### Playback session

Created from extension reports, never from the backend's play command. A pause
and resume stay in one session; a genuine repeat creates a new playback ID.

| Field | Meaning |
|-------|---------|
| `id` | Extension-generated playback ID |
| `roomId`, `videoId` | Room and track identity |
| `requestId` | Originating request when the track came from the bot queue |
| `source` | `requested`, `autoplay`, `manual`, or `unknown` |
| `startedAt`, `endedAt` | Observation boundaries |
| `listenedMs` | Observed playing time only |
| `endReason` | `completed`, `skipped`, `interrupted`, `replaced`, or `unknown` |
| `status` | `open`, `closed`, or `incomplete` |
| `qualified`, `completed` | Derived flags (see thresholds) |

Reports are accepted only from the socket whose fingerprint is the device
currently admitted to that room. Reports are deduplicated by playback ID and
listening time only moves forward, so retries cannot double count.

## Counting rules

- **Requested** — accepted bot requests in the period.
- **Started** — distinct playback sessions that began in the period.
- **Qualified play** — at least 30 seconds of observed playing, or at least 50%
  of a track whose known duration is under 60 seconds. The overview also shows
  starts and completion so the threshold is visible.
- **Completed** — at least 90% of the known track duration was observed and the
  playback has an established completed end. A completed end report without a
  known duration never counts as completed, and interrupted or skipped sessions
  never do either.
- **Skipped** — the next/previous control was used, the queue navigated to
  another track intentionally, or a track was restarted from the beginning
  after at least 30 seconds of progress.
- **Incomplete** — the last observation could not establish an end (browser
  closed, connection lost, device removed). It is never counted as completed or
  skipped.
- **Failed/unknown** — sessions with no established end (`status=incomplete` or
  `endReason=unknown`) are counted in the incomplete line. Failed queue inserts
  are reported separately as failed requests and are not counted as requests.
- **Observed playback time** — sum of `listenedMs` for the room. This is room
  playback time, not human listener-hours.
- **Unique tracks** — distinct YouTube video IDs with a playback in the period.

### Completion and replay rules

- Pause and resume stay inside one playback session.
- A track that ends and is played again gets a new playback ID.
- Rewinding to the start after at least 30 seconds of progress also ends the old
  session (as skipped) and starts a new playback.
- Completion requires 90% of the known duration observed. A player-reported end
  without a known duration is not upgraded to completed.
- A seek forward or backward never adds listening time.

### How listening time is observed

The extension samples the `<video>` element once per second. A delta counts only
when it is positive and consistent with the elapsed wall-clock time; seeks,
rewinds, and paused time are excluded. Checkpoints are sent every 30 seconds,
including while paused, so a live session does not look interrupted. Background
tab timer throttling is tolerated because the wall-clock check also allows long
gaps with matching playback progress.

## Attribution

YouTube video ID is the initial track key. Different uploads of the same
recording are separate tracks. Titles change, so the display snapshot is kept
for reporting only.

Request correlation comes from the request ID that travels with the queue item
to the extension. It is nullable: autoplay, manual playback, and songs queued
before rollout have no requester.

Source detection in the extension is deliberate but heuristic:

1. A correlated request → `requested`.
2. YouTube radio/autoplay playlist (`list=RD…`) → `autoplay`.
3. Another explicit playlist → `manual`.
4. Anything else → `unknown`.

Artist rankings group the artist display string. Display strings are not stable
artist identities, so artists with different spellings count separately.

## Periods and timezone

Period filters are `today`, `week`, `month`, and `all`.

- Every room uses the **server's local timezone** as its room timezone for
  analytics; set the deployment's `TZ` to the community's timezone. This matches
  the existing daily Play Next limits.
- `today` starts at local midnight.
- `week` starts Monday at local midnight.
- `month` starts on the 1st at local midnight.
- `all` has no lower bound.

Coverage start is the earliest request or playback recorded for the room.

## Commands

| Command | Default period | Description |
|---------|----------------|-------------|
| `/stats [period]` | `today` | Requests, starts, qualified plays, completion, listening time, top requesters, artists, and songs |
| `/top [songs\|requested\|artists] [period]` | `today` | Top played songs (qualified plays), top requested songs, or display artists |
| `/history [period]` | `all` | Ten most recent playbacks with outcome and observed time |
| `/mystats [period]` | `all` | Your requests and the playback attributed to them in this room |

Every summary is scoped to the current chat or forum topic. There are no
cross-room user profiles. `/stats` and `/top` expose room participation to room
members; they do not accept a user or room target.

## Scheduled recaps

Weekly and monthly recaps are intentionally optional and not enabled by this
release. The room-scoped queries behind `/stats` and `/top` already return the
period data a scheduler would send, so a recap can be added later without new
event tracking. Until an opt-in setting exists, no message is sent
automatically.

## Privacy and retention

- Store Telegram user IDs only on requests, where attribution is the feature.
- Do not store message text, usernames, device fingerprints, or browser names in
  analytics rows.
- Only the admitted device can contribute playback; a connected player still
  does not prove who is listening.
- Raw requests and playback sessions are pruned after
  `ANALYTICS_RETENTION_DAYS` (default 365; `0` disables pruning). A request that
  still has a recent linked playback is kept so attribution is not lost early.
- Aggregated totals are not stored separately, so pruning removes old history.
- To delete one user's attribution before retention expires, run:

  ```sql
  UPDATE "SongRequest" SET "requesterId" = NULL WHERE "requesterId" = '<telegram-id>';
  ```

  To remove their attributed history entirely, delete those request rows;
  linked playback sessions keep their counts with `requestId` set to null.

## Admin controls and deletion

- `/stats`, `/top`, `/history`, and `/mystats` are read-only. They never accept a
  room or user target, so members cannot query another room's analytics.
- `/mystats` always resolves the caller from the Telegram update; there is no way
  to request another member's personal summary.
- A room admin running `/unregister` deletes the room; `SongRequest` and
  `PlaybackSession` rows cascade with it.
- Operators set retention with `ANALYTICS_RETENTION_DAYS`. There is no
  per-message history to clean up because analytics stores no message text.
- A user deletion/anonymization request is handled with the SQL above, or by
  deleting the room. When deleting only one user's requests, note that playback
  counts stay in the room totals without attribution.

## Known limitations

- Playback is only as reliable as the admitted browser tab. Closing the tab or
  losing the connection without an end report leaves an incomplete session.
- Manual selections made outside the bot have no requester by design.
- Native player skips are detected through the next/previous controls. Other
  navigation that does not use those controls may be recorded as interrupted.
- Genres, moods, and languages are not inferred from titles.
- Old queues cannot be reconstructed into historical plays.

## Validation

Automated coverage includes:

- report validation, duplicate-safe upserts, out-of-order retries, request
  outcome monotonicity, and failed-request marking;
- pause/resume, seek rejection, background throttling, repeat playback, and
  skip/completion reasons;
- requested/autoplay/manual source attribution and request correlation;
- gateway admission by room, socket, and currently admitted device, including
  takeover by another device;
- room/topic isolation at both the command and query layers;
- period timezone boundaries, qualification/completion thresholds, coverage
  start, and retention.

A local PostgreSQL check additionally exercised the group-by rankings,
completion flags, interrupted-session reopening, and failed-request exclusion.
Playback reporting has no dependency on Telegram notification settings.
