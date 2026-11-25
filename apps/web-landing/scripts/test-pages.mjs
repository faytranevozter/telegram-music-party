import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the landing build cache includes both legal source documents', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const { tasks } = JSON.parse(execFileSync('pnpm', ['exec', 'turbo', 'run', 'build', '--filter=web-landing', '--dry=json'], { cwd: root, encoding: 'utf8' }));
    const { inputs } = tasks.find(({ taskId }) => taskId === 'web-landing#build');
    for (const source of ['PRIVACY.md', 'TERMS.md']) assert.ok(inputs[`../../${source}`], source);
});

test('all documents load the locally built daisyUI stylesheet', () => {
    for (const path of ['../public/index.html', '../public/gallery.html', '../public/support.html', '../public/privacy.html', '../public/terms.html', '../src/worker.ts']) {
        assert.ok(read(path).includes('href="/site-ui.css"'), path);
        assert.ok(read(path).includes('href="/appearance.css"'), path);
    }
    assert.match(read('../public/site-ui.css'), /\.swap-active/);
});

test('the Room busy advisory keeps its prose in one alert grid item', () => {
    assert.match(read('../public/support.html'), /class="alert[^"\n]* note">\s*<p>\s*One device plays per room\.[\s\S]*?<strong>Retry join<\/strong>\.<\/p>\s*<\/div>/);
});

test('worker routes every public page, including the generated legal pages', () => {
    const worker = read('../src/worker.ts');
    const routes = {
        '/': 'index.html',
        '/privacy': 'privacy.html',
        '/terms': 'terms.html',
        '/support': 'support.html',
        '/gallery': 'gallery.html',
    };
    for (const [route, file] of Object.entries(routes)) {
        assert.ok(
            worker.includes(`"${route}": "${file}"`),
            `${route} maps to ${file}`,
        );
        if (route === '/') continue;
        assert.ok(
            worker.includes(`"${route}/": "${file}"`),
            `${route}/ maps to ${file}`,
        );
    }
});

test('legal pages are generated from their root markdown with shared navigation', () => {
    const privacy = read('../public/privacy.html');
    const terms = read('../public/terms.html');

    assert.match(terms, /<title>Terms of Service — YouTube Music Party<\/title>/);
    assert.match(terms, /Last updated: November 20, 2026/);
    for (const html of [privacy, terms]) {
        assert.match(html, /<a href="\/privacy">Privacy Policy<\/a>/);
        assert.match(html, /<a href="\/terms">Terms of Service<\/a>/);
    }
    // The source documents stay the single source of truth.
    const termsSource = read('../../../TERMS.md');
    const privacySource = read('../../../PRIVACY.md');
    assert.match(termsSource, /^# Terms of Service/m);
    assert.match(privacySource, /^# Privacy Policy/m);
});

test('every public page links to the terms from its footer', () => {
    for (const page of [
        'index.html',
        'support.html',
        'gallery.html',
        'privacy.html',
        'terms.html',
    ]) {
        const html = read(`../public/${page}`);
        const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
        assert.match(footer, /href="\/terms"/, `${page} footer links terms`);
        assert.match(footer, /href="\/privacy"/, `${page} footer links privacy`);
    }
});
