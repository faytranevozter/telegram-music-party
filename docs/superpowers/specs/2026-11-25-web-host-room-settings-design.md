# Host-only web room settings

## Goal and scope

Let hosts of web-created rooms manage how guests search, queue, and vote to skip without using Telegram. The first version includes five settings:

- **Maximum queue size** — at least 1 song.
- **Votes needed to skip** — at least 1 vote.
- **Allow Play Next** — on or off.
- **Daily Play Next limit** — per guest; 0 means unlimited. Keep the saved limit when Play Next is turned off.
- **Allow video search** — on or off.

Leave playback permissions, invite management, and extension setup unchanged. Telegram-linked rooms continue to use Telegram’s `/config`. Don’t change existing defaults or proactively remove queued tracks, reset votes, or reset daily usage when saving settings.

## Approaches

- **Selected: start with queue and search settings.** Add a focused section to the current room page for the five settings above.
- **Deferred: full Telegram `/config` parity.** This would add transport permissions and other playback controls, but would make the first version larger without being necessary for managing requests.

## Design

Add a collapsed **Room settings** section below **Room info & invites**, visible only to hosts. Show current values and use an explicit **Save changes** button. Disable the daily-limit input when Play Next is off, without clearing its value. Preserve unsaved edits if a save fails and explain what went wrong.

Use the authenticated session to identify the room. Require its owner for both reading and updating settings; invitation guests must be denied by the API regardless of what the UI shows. Allow only the five fields above, validate boolean and integer inputs on the server, and save the changed fields together to the existing `Feature` record. No schema migration is needed. Keep the existing settings rules consistent with `/config` without changing Telegram’s UI or permissions.

After a save, publish a fresh room snapshot through the existing room-state channel so connected guests see changes to available search and queue actions without reloading. Keep editable settings out of guest snapshots. Existing server-side queue, voting, search, and quota checks continue to enforce the persisted values, including when a guest’s UI is stale.

## Acceptance checks

- A host can read, update, and reload the five settings; guests don’t see the panel and cannot read or write the settings through the API.
- Invalid or unknown fields are rejected without a partial save. Zero is accepted only for the daily limit.
- A connected guest sees availability changes for video search and Play Next without reloading, and subsequent requests use the saved limits.
- A failed save keeps the host’s edits and offers a retry. No existing invite behavior, Telegram configuration, or room defaults change.
