import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

const destinations = [
    ['Request a feature', 'https://github.com/faytranevozter/telegram-music-party/issues/new?template=feature_request.yml'],
    ['Report an issue', 'https://github.com/faytranevozter/telegram-music-party/issues/new?template=bug_report.yml'],
    ['Buy me a coffee', 'https://saweria.co/faytranevozter'],
];

for (const page of ['index.html', 'support.html']) {
    test(`${page} offers feedback and optional donations with safe external links`, () => {
        const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
        const section = html.match(/<section class="community-section"[\s\S]*?<\/section>/)?.[0];
        assert.ok(section, 'community section exists');
        assert.match(section, /aria-labelledby="community-title"/);
        assert.match(section, /id="community-title"/);
        const links = [...section.matchAll(/<a\b([^>]*)>([^<]+)<\/a>/g)];
        for (const [label, url] of destinations) {
            const link = links.find(([, , text]) => text === label);
            assert.ok(link, `${label} is present`);
            assert.ok(link[1].includes(`href="${url}"`));
            assert.match(link[1], /target="_blank"/);
            assert.match(link[1], /rel="noopener noreferrer"/);
            const template = new URL(url).searchParams.get('template');
            if (template) {
                assert.ok(existsSync(new URL(`../../../.github/ISSUE_TEMPLATE/${template}`, import.meta.url)));
            }
        }
        assert.match(section, /Donations are optional/);
        assert.match(section, /don’t unlock features/);
        assert.match(section, /don’t guarantee requests/);
        assert.match(section, /src="\/saweria-qr.png"/);
        assert.match(section, /alt="QR code linking to saweria.co\/faytranevozter"/);
        assert.ok(existsSync(new URL('../public/saweria-qr.png', import.meta.url)));
    });
}
