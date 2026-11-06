import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';

const root = fileURLToPath(new URL('../', import.meta.url));
config({ path: `${root}.env` });
const provider = process.env.DATABASE_PROVIDER || 'postgresql';
if (!['postgresql', 'sqlite'].includes(provider)) {
    throw new Error('DATABASE_PROVIDER must be postgresql or sqlite');
}
const canonical = readFileSync(`${root}prisma/schema.prisma`, 'utf8');
const sqlite = canonical.replace(
    'provider = "postgresql"',
    'provider = "sqlite"',
);
const sqlitePath = `${root}prisma/sqlite/schema.prisma`;
const [command, ...args] = process.argv.slice(2);
if (command === 'sync') {
    writeFileSync(sqlitePath, sqlite);
} else if (command === 'check') {
    if (readFileSync(sqlitePath, 'utf8') !== sqlite) {
        throw new Error('SQLite schema is out of date. Run pnpm db:sync');
    }
} else {
    const url = process.env.DATABASE_URL;
    // Generation does not connect to a database, but Prisma validates the URL.
    if (!url && command === 'generate') {
        process.env.DATABASE_URL =
            provider === 'sqlite'
                ? 'file:./dev.db'
                : 'postgresql://localhost:5432/telegram_music_party';
    } else if (
        !url ||
        !(provider === 'sqlite'
            ? url.startsWith('file:')
            : /^postgres(?:ql)?:\/\//.test(url))
    ) {
        throw new Error(
            `DATABASE_URL does not match DATABASE_PROVIDER=${provider}`,
        );
    }
    const schema =
        provider === 'sqlite'
            ? 'prisma/sqlite/schema.prisma'
            : 'prisma/schema.prisma';
    const cli = fileURLToPath(import.meta.resolve('prisma/build/index.js'));
    const commands = {
        generate: ['generate'],
        deploy: ['migrate', 'deploy'],
        migrate: ['migrate', 'dev'],
        studio: ['studio'],
    };
    if (!commands[command])
        throw new Error(`Unknown database command: ${command}`);
    const result = spawnSync(
        process.execPath,
        [cli, ...commands[command], '--schema', schema, ...args],
        {
            cwd: root,
            env: process.env,
            stdio: 'inherit',
        },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
}
