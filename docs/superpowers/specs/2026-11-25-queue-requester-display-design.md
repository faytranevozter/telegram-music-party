# Queue requester display

Use one setting per room for the web **Up next** request list and Telegram’s **`/queue`**. Web-created room hosts edit **Requester display** in **Room info & settings**. Telegram group admins edit it through **`/config`** in Telegram-linked rooms; invite sessions do not grant configuration access. No personal or per-track overrides.

- **Hidden** (default for existing and new rooms): no requester line.
- **Anonymous**: `Requested by Anonymous` on requested tracks in the queue.
- **Show names**: `Requested by Alex`, using the display name at request time (web nickname or Telegram display name). Older entries without a stored name have no requester line.

Autoplay and now playing get no requester label. Both Queue and Play Next requests are attributed. Changes apply to the current queue as it is next rendered; earlier Telegram messages are not edited. The setting governs presentation, not past messages or analytics. Store a bounded display-name snapshot only with the queue row, including in Hidden and Anonymous, so flipping the setting applies to tracks still queued. Explain this behavior in the settings help. Do not expose raw identity references, usernames looked up from IDs, or names in Anonymous/Hidden responses; do not add names to the extension protocol.

## Approaches

- **Selected: queue-row display name and one server-side label rule.** It applies the same policy for both surfaces and removes the snapshot with the queue row, independent of analytics.
- **Not selected: analytics join or live name lookup.** Analytics does not reliably have a display name; lookup may fail or show a different name than the requester used at submission. Client-only hiding would still disclose names in network responses.
