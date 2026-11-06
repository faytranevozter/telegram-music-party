# Database providers

PostgreSQL remains the default. SQLite is an optional single-instance deployment
target. Redis is still required for caching. No extension changes are needed.
Prisma CLI and client remain pinned to 6.5.0.

## Local SQLite setup

Set these values in `apps/backend/.env` (alongside the bot token and Redis URL):

```dotenv
DATABASE_PROVIDER=sqlite
DATABASE_URL="file:./dev.db"
```

From the repository root:

```sh
pnpm --filter=backend db:check
pnpm --filter=backend db:generate
pnpm --filter=backend db:deploy
pnpm --filter=backend dev
```

Relative file URLs resolve from `apps/backend/prisma/sqlite/`. An absolute URL
(`file:/absolute/path/party.db`) avoids ambiguity; its parent directory must exist
and be writable. Database files and SQLite journal sidecars are gitignored.

## Switching providers

Set `DATABASE_PROVIDER=postgresql` and a PostgreSQL `DATABASE_URL` to use PostgreSQL.
Then rerun `db:generate` and rebuild the backend. A generated client supports only
its selected provider: changing the URL of an existing build is not enough.
Startup validates the provider, generated client, and URL scheme.

Each provider has an independent migration history. Existing PostgreSQL migrations
are unchanged. SQLite starts with an empty database; switching does **not** copy data.
Never point a new provider at the other provider's migration history.

## Docker

Build a SQLite-specific image from the repository root:

```sh
docker build -f apps/backend/Dockerfile --build-arg DATABASE_PROVIDER=sqlite -t music-party:sqlite .
docker volume create music-party-data
docker run --env-file apps/backend/.env \
  -e DATABASE_PROVIDER=sqlite -e DATABASE_URL=file:/app/data/party.db \
  -v music-party-data:/app/data -p 3000:3000 music-party:sqlite
```

Use a Redis URL reachable from the container (container localhost is not the host).
The image creates `/app/data` for its non-root user. Bind-mounted directories must
be writable by that user; an empty named volume inherits the image's directory
ownership. Startup applies the selected provider's migrations before starting Nest.
The default build argument produces the existing PostgreSQL variant.

Version-tag pushes (`v*`) publish both variants to
`ghcr.io/faytranevozter/telegram-music-party` through the Docker Publish workflow.
PostgreSQL keeps `latest`, version (for example `1.9.1`), and short commit tags.
SQLite uses `sqlite`, version-suffixed tags (`1.9.1-sqlite`), and short commit tags
with the `-sqlite` suffix. Build caches are isolated by provider.

Keep SQLite on local persistent storage with **one backend instance**. Do not share
the file across replicas or use a network filesystem. PostgreSQL remains the better
choice for larger concurrent workloads. The default SQLite journal mode is retained.

For backups, stop the backend before copying the database file and any journal
sidecars, or use SQLite's online backup API/CLI `.backup` command. Do not copy only
the main database file while writes are in progress. Restore with the backend
stopped and preserve file ownership. Never remove the persistent volume on upgrade.

## Schema changes

`prisma/schema.prisma` is the canonical model definition. After editing it:

```sh
pnpm --filter=backend db:sync
pnpm --filter=backend db:check
pnpm --filter=backend db:migrate --name describe_change
```

Create and review a migration for **each** provider using separate development
databases and the appropriate environment settings. `db:sync` only synchronizes the
SQLite schema; it does not generate migrations. Regenerate the client whenever
switching providers. Do not upgrade Prisma as part of a database-provider switch.

## Verification

Against a disposable database, select a provider and run:

```sh
pnpm --filter=backend db:check
pnpm --filter=backend db:generate
pnpm --filter=backend db:deploy
pnpm --filter=backend db:deploy
pnpm --filter=backend build
pnpm --filter=backend test --runInBand
pnpm --filter=backend test:database
```

The integration script uses unique test rooms and cleans them up. It exercises room
and topic lookup, uniqueness, features, queue priority, device replacement,
concurrent vote writes, playback-report retries, analytics aggregation and dates,
reconnection persistence, retention, nullable request links, and cascade deletion.
Run it on both providers. For container persistence, recreate the container with the
same volume and verify an existing room is still registered.
