import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('worker routes every public page, including the generated legal pages', () => {
    const worker = read('../src/worker.ts');
    const routes = {
        '/': 'index.html',
        '/privacy': 'privacy.html',
        '/terms': 'terms.html',
        '/support': 'support.html',
        '/gallery': 'gallery.html',
        '/room': 'room-app/shell.html',
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
