import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

function page({ storage = new Map(), dark = true, blocked = false, themeClasses = false } = {}) {
    const classes = new Set();
    const root = { dataset: {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } };
    const picker = { value: 'system', matches: () => true };
    const listeners = {};
    const media = { matches: dark, addEventListener: (name, fn) => { listeners.media = fn; } };
    const document = {
        currentScript: { dataset: { appearanceKey: 'appearance', darkTheme: 'night', ...(themeClasses ? { appearanceThemeClasses: '' } : {}) } },
        documentElement: root,
        querySelectorAll: () => [picker],
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
        choice: () => picker.value,
        classes,
        choose: (value) => { picker.value = value; listeners.change({ target: picker }); },
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
    view.choose('light');
    assert.deepEqual([...view.classes], ['light']);
});

test('remembers an override and applies the current device theme on reset', () => {
    const storage = new Map();
    page({ storage }).choose('light');
    const reopened = page({ storage, dark: false });
    assert.equal(reopened.choice(), 'light');
    reopened.system(true);
    assert.equal(reopened.theme(), 'light');
    reopened.choose('system');
    assert.equal(reopened.theme(), 'night');
});

test('ignores invalid saved preferences', () => {
    assert.equal(page({ storage: new Map([['appearance', '__proto__']]) }).theme(), 'night');
});

test('still switches locally when storage is blocked', () => {
    const view = page({ blocked: true });
    view.choose('light');
    assert.equal(view.theme(), 'light');
});
