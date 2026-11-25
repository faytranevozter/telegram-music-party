import { readFileSync, writeFileSync } from 'node:fs';

for (const app of ['web', 'web-landing', 'backend', 'extension']) for (const name of ['appearance.js', 'appearance.css']) {
    const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    const target = new URL(`../apps/${app}/public/${name}`, import.meta.url);
    if (!process.argv.includes('--check')) {
        writeFileSync(target, source);
    } else {
        let installed;
        try { installed = readFileSync(target, 'utf8'); } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        if (installed !== source) {
            console.error(`apps/${app}/public/${name} is out of sync; run node scripts/sync-appearance.mjs`);
            process.exitCode = 1;
        }
    }
}
