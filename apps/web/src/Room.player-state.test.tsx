// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Room } from './Room';
import { createWebApi } from './api';

const room = vi.hoisted(() => ({
    playerState: undefined as { state: 'playing' | 'paused'; volume: number; muted: boolean; adPlaying?: boolean } | undefined,
    refusedRequest: null as { title: string } | null,
    dismissRefusedRequest: vi.fn(),
}));
vi.mock('./use-room', () => ({ useRoom: () => ({
    state: {
        name: 'Room', role: 'guest', playerOnline: true, queue: [],
        nowPlaying: { title: 'Test track', artist: 'Artist', videoId: 'abcdefghijk' },
        capabilities: { controls: ['play', 'pause', 'mute', 'unmute'], playNext: false, playNextRemaining: null, videoSearch: false },
        playerState: room.playerState,
    }, live: true, error: '', refresh: vi.fn(),
    refusedRequest: room.refusedRequest, dismissRefusedRequest: room.dismissRefusedRequest,
}) }));

it('reflects live player changes without a local control command', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const transport = vi.fn();
    const api = createWebApi('https://example.test', transport as typeof fetch);
    const render = () => act(async () => root.render(<Room api={api} token="token" onLeave={() => undefined} onRevoked={() => undefined} />));
    const button = (label: string) => container.querySelector(`button[aria-label="${label}"]`);
    const playbackControls = () => container.querySelector('[role="group"][aria-label="Playback controls"]');
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    try {
        await render();
        expect(container.textContent).not.toContain('Volume:');
        expect(button('Play')).not.toBeNull();
        expect(button('Pause')).not.toBeNull();
        room.playerState = { state: 'playing', volume: 25, muted: false };
        await render();
        expect(button('Pause')).not.toBeNull();
        expect(playbackControls()?.textContent).toContain('Volume: 25%');
        expect(container.textContent).not.toContain('Now playing · Volume:');

        room.playerState = { ...room.playerState, adPlaying: true };
        await render();
        expect(container.textContent).toContain('Ad playing');
        expect(container.textContent).toContain('Test track');

        room.playerState = { state: 'paused', volume: 70, muted: true };
        await render();
        expect(button('Play')).not.toBeNull();
        expect(container.textContent).toContain('Paused');
        expect(container.textContent).not.toContain('Ad playing');
        expect(playbackControls()?.textContent).toContain('Volume: 70%');
        expect(container.textContent).toContain('Unmute');
        expect(transport).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    }
});

it('shows and dismisses a private refusal notice', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const api = createWebApi('https://example.test', vi.fn() as typeof fetch);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    try {
        room.refusedRequest = { title: 'Good Life' };
        await act(async () => root.render(<Room api={api} token="token" onLeave={() => undefined} onRevoked={() => undefined} />));
        expect(container.querySelector('[role="alert"]')?.textContent).toContain('“Good Life” couldn’t play on the host’s player and was removed from the queue.');
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Dismiss message"]')?.click());
        expect(room.dismissRefusedRequest).toHaveBeenCalledOnce();
    } finally {
        room.refusedRequest = null;
        await act(async () => root.unmount());
        vi.unstubAllGlobals();
    }
});
