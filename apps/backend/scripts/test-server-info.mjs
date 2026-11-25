import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the server info page and its mounted assets are packaged together', () => {
    const html = read('../public/index.html');
    for (const asset of ['appearance.js', 'appearance.css', 'server-ui.css', 'server-icon.png']) {
        assert.ok(html.includes(`"./${asset}"`), asset);
        assert.ok(read(`../public/${asset}`).length, asset);
    }
    assert.match(read('../public/server-ui.css'), /\.swap-active/);
    assert.match(read('../Dockerfile'), /COPY --from=build --chown=nodejs:nodejs \/app\/apps\/backend\/public \.\/public/);
    assert.match(html, /id="server-url"[^>]*readonly/);
    assert.match(html, /id="copy-status"[^>]*role="status"/);
});
