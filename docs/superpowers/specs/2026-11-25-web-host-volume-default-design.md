# Web host volume controls by default

Hosts of new and existing web-created rooms should have **Volume Up** and **Volume Down** available by default, like **Next** and **Previous**. Both the advertised controls and the server must agree. An offline player still cannot receive commands.

## Approaches

- **Use the shared web-room authorization check.** Allow authenticated hosts of web-created rooms to adjust volume even when the stored flag is off. Keep the existing flag behavior for guests and Telegram-linked rooms. This covers existing rooms without changing stored settings or adding a migration.
- **Backfill stored flags.** Turning on the shared volume flag would also grant guest access unless a separate permission were added. That adds a migration and risks changing existing permissions, so use the web-only rule instead.
