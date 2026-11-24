# Web autoplay queue preview

Add a **Show autoplay** switch to **Up next** for hosts and guests. It starts off, is local to the room view, and never changes playback or YouTube Music's autoplay setting. When on, show the first five upcoming non-requested player tracks in player order, in a separate **Autoplay · From YouTube Music** section. Keep the requested queue, its count, and skip voting unchanged.

Reuse the admitted player's existing `get-player-queue` response, as Telegram `/queue` does, and exclude current/history tracks and IDs already in the shared requests. This shows the player's real queue without requiring an extension update; synthesizing recommendations from search would not reflect playback. Fetch only while the viewer has the preview open. Refresh it periodically so changes made directly on the player are picked up. Offline, unreadable, and empty previews must not interfere with requests, and hiding the section should stop refreshes.
