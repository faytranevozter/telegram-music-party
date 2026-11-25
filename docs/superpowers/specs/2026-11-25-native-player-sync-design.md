# Native player state sync

When the admitted player changes play/pause, volume, or mute in YouTube Music, Telegram should receive the corresponding notification and the web room should reflect the real state. The extension popup and remote commands must use the same observation path as native controls.

## Approach

Use the active video element's media events to report the player's state. This covers native and remote controls without inferring success from commands. Polling would add latency and work; intercepting clicks would miss keyboard shortcuts, media keys, and other ways of changing the player.

Send an initial snapshot on admission or reconnect without Telegram notifications. Publish changes through the existing web room state channel. Notify Telegram on observed changes only, coalesce slider drags, and keep track-start announcements, queue behavior, and analytics independent. The backend accepts reports only from the admitted player. No new dependencies or database changes.
