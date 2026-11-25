/* Shared appearance bootstrap. Update public copies with node scripts/sync-appearance.mjs. */
(() => {
    const { appearanceKey, lightTheme = 'light', darkTheme = 'dark', appearanceMount, appearanceThemeClasses } = document.currentScript.dataset;
    const selector = 'select[data-appearance-select]';
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    const valid = (value) => value === 'system' || value === 'light' || value === 'dark';
    let preference = 'system';
    try {
        const saved = localStorage.getItem(appearanceKey);
        if (valid(saved)) preference = saved;
    } catch { /* Storage can be blocked. */ }

    const syncPickers = () => {
        document.querySelectorAll(selector).forEach((picker) => {
            if (picker.value !== preference) picker.value = preference;
        });
    };
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
    document.addEventListener('change', ({ target }) => {
        if (!target?.matches?.(selector) || !valid(target.value)) return;
        preference = target.value;
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
