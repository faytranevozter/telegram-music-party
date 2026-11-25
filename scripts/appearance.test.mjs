import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

function page({ storage = new Map(), dark = true, blocked = false, themeClasses = false } = {}) {
    const classes = new Set();
    const root = { dataset: {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } };
    const node = () => ({ dataset: {}, classList: { toggle() {} }, append() {}, setAttribute(name, value) { this[name] = value; } });
    const picker = node();
    const listeners = {};
    const media = { matches: dark, addEventListener: (name, fn) => { listeners.media = fn; } };
    const document = {
        currentScript: { dataset: { appearanceKey: 'appearance', darkTheme: 'night', ...(themeClasses ? { appearanceThemeClasses: '' } : {}) } },
        documentElement: root,
        querySelectorAll: () => [picker],
        createElement: node,
        createElementNS: node,
        addEventListener: (name, fn) => { listeners[name] = fn; },
    };
    const localStorage = {
        getItem: (key) => { if (blocked) throw new Error('blocked'); return storage.get(key); },
        setItem: (key, value) => { if (blocked) throw new Error('blocked'); storage.set(key, value); },
    };
    class MutationObserver { observe() {} }
    runInNewContext(readFileSync(new URL('./appearance.js', import.meta.url), 'utf8'), {
        document, localStorage, matchMedia: () => media, MutationObserver,
    });
    return {
        theme: () => root.dataset.theme,
        choice: () => picker.dataset.appearanceMode,
        label: () => picker['aria-label'],
        classes,
        cycle: () => listeners.click?.({ target: { closest: (selector) => selector === '[data-appearance-swap]' ? picker : null } }),
        system: (value) => { media.matches = value; listeners.media(); },
    };
}

test('follows the system initially and when the system changes', () => {
    const view = page();
    assert.equal(view.theme(), 'night');
    view.system(false);
    assert.equal(view.theme(), 'light');
});

test('supports class-based theme variants without leaving stale classes behind', () => {
    const view = page({ themeClasses: true });
    assert.deepEqual([...view.classes], ['dark']);
    view.cycle();
    assert.deepEqual([...view.classes], ['light']);
});

test('remembers an override and applies the current device theme on reset', () => {
    const storage = new Map();
    page({ storage }).cycle();
    const reopened = page({ storage, dark: false });
    assert.equal(reopened.choice(), 'light');
    reopened.system(true);
    assert.equal(reopened.theme(), 'light');
    reopened.cycle();
    reopened.cycle();
    assert.equal(reopened.theme(), 'night');
    assert.equal(reopened.choice(), 'system');
    reopened.system(false);
    assert.equal(reopened.theme(), 'light');
});

test('ignores invalid saved preferences', () => {
    assert.equal(page({ storage: new Map([['appearance', '__proto__']]) }).theme(), 'night');
});

test('still switches locally when storage is blocked', () => {
    const view = page({ blocked: true });
    view.cycle();
    assert.equal(view.theme(), 'light');
});

test('an icon click advances exactly one mode and wraps back to System', () => {
    const view = page();
    assert.equal(view.choice(), 'system');
    assert.match(view.label(), /System.*Light/);
    for (const mode of ['light', 'dark', 'system']) {
        view.cycle();
        assert.equal(view.choice(), mode);
    }
});
