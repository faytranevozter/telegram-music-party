import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function loadPage(href, clipboard) {
    const elements = {
        'server-url': {
            value: '',
            focus() { this.focused = true; },
            select() { this.selected = true; },
        },
        'copy-url': {
            disabled: true,
            addEventListener(event, handler) {
                assert.equal(event, 'click');
                this.click = handler;
            },
        },
        'copy-status': { textContent: '' },
    };
    runInNewContext(script, {
        URL,
        window: { location: { href } },
        navigator: { clipboard },
        document: { getElementById: (id) => elements[id] },
    });
    return elements;
}

test('uses the opened deployment URL, preserving hosts, ports and mount paths', () => {
    for (const [opened, expected] of [
        ['https://music.ytparty.my.id/', 'https://music.ytparty.my.id'],
        ['http://localhost:3010/?source=test#main', 'http://localhost:3010'],
        ['https://party.example:8443/music/', 'https://party.example:8443/music'],
        ['https://party.example/music/index.html?q=test#main', 'https://party.example/music'],
        ['http://[::1]:3000/index.html', 'http://[::1]:3000'],
    ]) {
        const elements = loadPage(opened);
        assert.equal(elements['server-url'].value, expected);
        assert.equal(elements['copy-url'].disabled, false);
    }
});

test('copies the displayed URL and announces success', async () => {
    let copied;
    const elements = loadPage('https://party.example/', {
        async writeText(value) { copied = value; },
    });
    await elements['copy-url'].click();
    assert.equal(copied, 'https://party.example');
    assert.match(elements['copy-status'].textContent, /Server URL copied/);
});

test('selects the URL for manual copying when clipboard is unavailable or denied', async () => {
    for (const clipboard of [undefined, {
        async writeText() { throw new Error('Permission denied'); },
    }]) {
        const elements = loadPage('http://party.example/', clipboard);
        await elements['copy-url'].click();
        assert.equal(elements['server-url'].focused, true);
        assert.equal(elements['server-url'].selected, true);
        assert.match(elements['copy-status'].textContent, /copy it manually/);
    }
});

test('keeps installation and support links, live feedback and no-script instructions', () => {
    assert.match(html, /href="https:\/\/ytparty\.my\.id\/support"/);
    assert.match(html, /href="https:\/\/chromewebstore\.google\.com\/detail\/youtube-music-party\/pdibhcofofkfblpajpjcpopbbbbbncbk"/);
    assert.match(html, /role="status" aria-live="polite"/);
    assert.match(html, /<noscript>/);
    assert.match(html, /readonly/);
});
