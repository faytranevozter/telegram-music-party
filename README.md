# Telegram Music Party

A Telegram bot that allows users to play music from different sources like Spotify and soon Youtube, and control the playback in a group chat.
## Feature
- Room music party
- Add queue from telegram
- Room creation by run telegram command
- Youtube music control

## How to Use this Bot
- Add [@xmsc_bot](https://t.me/xmsc_bot) to your Telegram group.
- Run the command /register in the group chat.
- Install [YT Music Party](https://addons.mozilla.org/en-US/firefox/addon/yt-music-party/) from firefox
- Input the code displayed in the extension to link the extension to the bot.
- Click the "Join" button in the extension to join the group chat.

## How to Add Queue
- Tag @xmsc_bot in the group chat, followed by "[music name] here" (e.g. @xmsc_bot Shape of You here).
- Bot will display the results of the search. Click the "Add to queue" button next to the desired result.
- Then, run the command /play in the group chat to play the music from the queue.

## Available Command
- **/start**: Show instructions
- **/register**: Register chat to party
- **/play**: Play a music
- **/pause**: You know this
- **/devices**: List all device joined
- **/queue**: Queue list
- **/unregister**: Leave from party


## Technologies:
- Telegram API (telegraf)
- NodeJS
- Typescript
- RxJS
- Prisma ORM
- Postgre SQL
- NestJS

## Versioning & release

Semver lives in `VERSION` (source of truth) and is mirrored in root + workspace `package.json` files.

### Bump

```bash
# patch  1.5.4 → 1.5.5
pnpm version:patch
# or
./scripts/bump-semver.sh patch

# minor  1.5.4 → 1.6.0
pnpm version:minor

# major  1.5.4 → 2.0.0
pnpm version:major
```

Commit the bumped files, then publish:

```bash
git checkout main && git pull
# ensure VERSION is what you want
git tag "v$(tr -d '[:space:]' < VERSION)"
git push origin "v$(tr -d '[:space:]' < VERSION)"
```

Pushing a `v*.*.*` tag runs **Docker Publish** and pushes to GHCR:

```
ghcr.io/faytranevozter/telegram-music-party:vX.Y.Z
ghcr.io/faytranevozter/telegram-music-party:latest
```
