// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { sampleArtworkGradient } from './artwork-gradient';
import { NowPlayingPanel } from './RoomPanels';

vi.mock('./artwork-gradient', () => ({ sampleArtworkGradient: vi.fn() }));

it('only shows the current artwork gradient and falls back without a source', async () => {
    const pending = new Map<string, (gradient: string | undefined) => void>();
    vi.mocked(sampleArtworkGradient).mockImplementation((source) => new Promise((resolve) => { pending.set(source, resolve); }));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    const root = createRoot(container);
    const render = (artworkSource?: string) => act(() => root.render(<NowPlayingPanel artworkSource={artworkSource} title="Track" controls="Controls" />));
    const background = () => container.querySelector('section')?.style.backgroundImage;
    try {
        await render('red');
        expect(background()).toBe('');
        await act(() => pending.get('red')?.('linear-gradient(darkred, black)'));
        expect(background()).toContain('darkred');
        await render('green');
        expect(background()).toBe('');
        await render('blue');
        await act(() => pending.get('blue')?.('linear-gradient(darkblue, black)'));
        await act(() => pending.get('green')?.('linear-gradient(darkgreen, black)'));
        expect(background()).toContain('darkblue');
        await render();
        expect(background()).toBe('');
    } finally {
        await act(() => root.unmount());
        vi.unstubAllGlobals();
    }
});
