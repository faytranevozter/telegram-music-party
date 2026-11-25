import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const script = (html, key) => assert.match(html, new RegExp(`<script src="(?:/|\\./)appearance\\.js" data-appearance-key="${key}"`));
const picker = (html) => {
    assert.equal([...html.matchAll(/<button\b[^>]*\bdata-appearance-swap\b/g)].length, 1);
    assert.match(html, /<button\b(?=[^>]*\btype="button")(?=[^>]*\bdata-appearance-swap\b)[^>]*>/);
};

test('the web room and popup expose appearance outside their session UI', () => {
    for (const [app, key] of [['web', 'ytmp-room-appearance'], ['extension', 'ytmp-popup-appearance']]) {
        script(read(`apps/${app}/index.html`), key);
        const source = read(`apps/${app}/src/App.tsx`);
        picker(source);
        assert.ok(source.indexOf('data-appearance-swap') < source.indexOf(app === 'web' ? '{api && session ?' : '{showJoinForm &&'));
    }
});

test('every public page loads the local controller and exposes the same landing preference', () => {
    const landing = ['index', 'gallery', 'support', 'privacy', 'terms'].map((name) => `public/${name}.html`);
    for (const path of [...landing, 'scripts/legal-page.mjs', 'src/worker.ts']) {
        const source = read(`apps/web-landing/${path}`);
        script(source, 'ytmp-site-appearance');
        picker(source);
    }
    const server = read('apps/backend/public/index.html');
    script(server, 'ytmp-server-appearance');
    picker(server);
});
