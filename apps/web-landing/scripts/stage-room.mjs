import { access, cp, mkdir, rename, rm } from 'node:fs/promises';

const source = new URL('../../web/dist/', import.meta.url);
const target = new URL('../public/room-app/', import.meta.url);
try {
    await access(new URL('index.html', source));
} catch {
    throw new Error('Room bundle missing. Run pnpm --filter=web build first.');
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await rename(new URL('index.html', target), new URL('shell.html', target));
