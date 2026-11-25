/* Shared appearance bootstrap. Update public copies with node scripts/sync-appearance.mjs. */
(() => {
    const { appearanceKey, lightTheme = 'light', darkTheme = 'dark', appearanceMount, appearanceThemeClasses } = document.currentScript.dataset;
    const selector = '[data-appearance-swap]';
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    const modes = ['system', 'light', 'dark'];
    const names = { system: 'System', light: 'Light', dark: 'Dark' };
    const next = () => modes[(modes.indexOf(preference) + 1) % modes.length];
    let preference = 'system';
    try {
        const saved = localStorage.getItem(appearanceKey);
        if (modes.includes(saved)) preference = saved;
    } catch { /* Storage can be blocked. */ }

    const controls = new WeakMap();
    const icon = (className, outline) => {
        const ns = 'http://www.w3.org/2000/svg';
        const element = document.createElementNS(ns, 'svg');
        for (const [name, value] of Object.entries({ class: className, width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) element.setAttribute(name, value);
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', outline);
        element.append(path);
        return element;
    };
    const syncPickers = () => document.querySelectorAll(selector).forEach((button) => {
        if (button.dataset.appearanceMode === preference) return;
        if (!controls.has(button)) {
            const swap = document.createElement('span');
            swap.className = 'swap swap-rotate';
            swap.setAttribute('aria-hidden', 'true');
            swap.append(
                icon('swap-off', 'M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'),
                icon('swap-on', 'M21 13.3A9 9 0 0 1 10.7 3 9 9 0 1 0 21 13.3Z'),
                icon('appearance-system-icon', 'M3 4h18v13H3zM8 21h8m-4-4v4'),
            );
            const label = document.createElement('span');
            button.append(swap, label);
            controls.set(button, { swap, label });
        }
        const { swap, label } = controls.get(button);
        swap.classList.toggle('swap-active', preference === 'dark');
        label.textContent = names[preference];
        button.dataset.appearanceMode = preference;
        button.setAttribute('aria-label', `Appearance: ${names[preference]}. Switch to ${names[next()]}`);
    });
    const apply = () => {
        const scheme = preference === 'system' ? (media?.matches ? 'dark' : 'light') : preference;
        const root = document.documentElement;
        root.dataset.theme = scheme === 'dark' ? darkTheme : lightTheme;
        if (appearanceThemeClasses !== undefined) {
            root.classList.toggle('dark', scheme === 'dark');
            root.classList.toggle('light', scheme === 'light');
        }
        syncPickers();
    };

    apply();
    media?.addEventListener('change', () => { if (preference === 'system') apply(); });
    document.addEventListener('click', ({ target }) => {
        if (!target?.closest?.(selector)) return;
        preference = next();
        try { localStorage.setItem(appearanceKey, preference); } catch { /* Use the current page's choice. */ }
        apply();
    });
    document.addEventListener('DOMContentLoaded', syncPickers, { once: true });
    if (appearanceMount) {
        document.addEventListener('DOMContentLoaded', () => {
            const mount = document.querySelector(appearanceMount);
            if (mount) new MutationObserver(syncPickers).observe(mount, { childList: true, subtree: true });
        }, { once: true });
    }
})();
