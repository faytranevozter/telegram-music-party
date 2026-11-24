// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Room } from './Room';
import { createWebApi } from './api';

const room = vi.hoisted(() => ({ role: 'guest' as 'guest' | 'owner' }));
vi.mock('./use-room', () => ({ useRoom: () => ({ state: { name: 'Room', role: room.role, playerOnline: false, queue: [], nowPlaying: null, capabilities: { controls: [], playNext: false, playNextRemaining: null, videoSearch: false } }, live: true, error: '', refresh: vi.fn() }) }));

it('shows settings only for a host, not an invited guest', async () => {
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    const transport = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ roomId: 'room', shareCode: null, maxQueueSize: 10, minimumVotes: 1, dailyPlayNextLimit: 0, playNextCommand: false, allowVideoSearch: false }) });
    const api = createWebApi('https://example.test', transport as typeof fetch);
    const leave = vi.fn(); const revoked = vi.fn();
    room.role = 'guest';
    await act(async () => root.render(<Room api={api} token="token" onLeave={leave} onRevoked={revoked} />));
    expect(container.textContent).not.toContain('Room settings');
    expect(transport).not.toHaveBeenCalled();
    room.role = 'owner';
    await act(async () => root.render(<Room api={api} token="token" onLeave={leave} onRevoked={revoked} />));
    expect(container.textContent).toContain('Room settings');
    const panels = [...container.querySelectorAll('details')].filter((element) => element.textContent?.includes('Room settings'));
    expect(panels).toHaveLength(1);
    expect(panels[0].textContent).toContain('Guest access');
    expect(panels[0].textContent).toContain('Player setup');
    expect(panels[0].textContent).toContain('Maximum queue size');
    await act(async () => root.unmount());
    container.remove();
});
