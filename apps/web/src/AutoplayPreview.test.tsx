// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AutoplayPreview } from './AutoplayPreview';

it('reads only when shown and online, refreshes, and aborts when hidden', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    const container = document.createElement('div');
    const root = createRoot(container);
    let finish: ((value: { status: 'ok'; tracks: [] }) => void) | undefined;
    const autoplay = vi.fn()
        .mockResolvedValueOnce({ status: 'ok', tracks: [{ videoId: 'a', title: 'Autoplay song', artist: 'Artist', durationSeconds: 292 }] })
        .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
        .mockResolvedValueOnce({ status: 'ok', tracks: [] })
        .mockResolvedValueOnce({ status: 'timeout' });
    const api = { autoplay };
    const revoke = vi.fn();
    const render = (shown: boolean, online = true, requestedCount = 0) => act(() => root.render(shown && <AutoplayPreview api={api} token="token" online={online} requestedCount={requestedCount} onRevoked={revoke} />));
    try {
        await render(false);
        expect(autoplay).not.toHaveBeenCalled();
        await render(true, false);
        expect(container.textContent).toContain('Player offline');
        expect(autoplay).not.toHaveBeenCalled();
        await render(true);
        expect(container.textContent).toContain('Autoplay song');
        expect(container.textContent).toContain('Artist · 4:52');
        const list = container.querySelector<HTMLOListElement>('ol[aria-label="Upcoming autoplay tracks"]');
        expect(list?.querySelector('[aria-hidden="true"]')?.textContent).toBe('01');
        expect(list?.querySelector('li')?.classList.contains('grid-cols-[2rem_minmax(0,1fr)]')).toBe(true);
        expect(list?.textContent).not.toContain('Next to play');
        await render(true, true, 2);
        expect(list?.querySelector('[aria-hidden="true"]')?.textContent).toBe('03');
        expect(list?.start).toBe(3);
        expect(autoplay).toHaveBeenCalledTimes(1);
        await act(() => vi.advanceTimersByTimeAsync(10_000));
        expect(autoplay).toHaveBeenCalledTimes(2);
        const signal = autoplay.mock.calls[1][1] as AbortSignal;
        await render(true, false);
        expect(signal.aborted).toBe(true);
        await act(() => finish?.({ status: 'ok', tracks: [] }));
        expect(container.textContent).toContain('Player offline');
        expect(container.textContent).not.toContain('Autoplay song');
        await render(true);
        expect(container.textContent).toContain('No upcoming autoplay tracks.');
        await act(() => vi.advanceTimersByTimeAsync(10_000));
        expect(container.textContent).toContain('Autoplay preview is unavailable.');
        await render(false);
        expect(container.textContent).toBe('');
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        expect(autoplay).toHaveBeenCalledTimes(4);
    } finally {
        await act(() => root.unmount());
        vi.useRealTimers();
        vi.unstubAllGlobals();
    }
});
