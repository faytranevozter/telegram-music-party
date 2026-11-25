import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('./appearance.js', import.meta.url), 'utf8');
for (const app of ['web', 'web-landing', 'backend', 'extension']) {
    const target = new URL(`../apps/${app}/public/appearance.js`, import.meta.url);
    if (!process.argv.includes('--check')) {
        writeFileSync(target, source);
    } else {
        let installed;
        try { installed = readFileSync(target, 'utf8'); } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        if (installed !== source) {
            console.error(`apps/${app}/public/appearance.js is out of sync; run node scripts/sync-appearance.mjs`);
            process.exitCode = 1;
        }
    }
}
