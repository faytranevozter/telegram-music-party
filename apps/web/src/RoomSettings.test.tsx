// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createWebApi } from './api';
import { RoomSettings } from './RoomSettings';

const settings = { maxQueueSize: 10, minimumVotes: 2, playNextCommand: true, dailyPlayNextLimit: 3, allowVideoSearch: false };
const flush = () => act(async () => { await Promise.resolve(); });
afterEach(() => { document.body.innerHTML = ''; });

it('uses authenticated settings endpoints', async () => {
    const transport = vi.fn().mockResolvedValue({ ok: true, json: async () => settings });
    const api = createWebApi('https://example.test', transport as typeof fetch);
    expect(await api.settings('token')).toEqual(settings);
    expect(await api.updateSettings('token', { dailyPlayNextLimit: 0 })).toEqual(settings);
    expect(transport).toHaveBeenNthCalledWith(1, 'https://example.test/api/web/v1/room/settings', expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer token' } }));
    expect(transport).toHaveBeenNthCalledWith(2, 'https://example.test/api/web/v1/room/settings', expect.objectContaining({ method: 'POST', body: JSON.stringify({ dailyPlayNextLimit: 0 }) }));
});

it('retains the Play Next limit and draft through a failed save', async () => {
    const api = { settings: vi.fn().mockResolvedValue(settings), updateSettings: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ...settings, playNextCommand: false }) };
    const flash = vi.fn();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<RoomSettings api={api} token="token" onRevoked={vi.fn()} onFlash={flash} />); });
    expect(container.querySelector('details')?.open).toBe(false);
    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    const daily = [...container.querySelectorAll<HTMLInputElement>('input[type="number"]')].find((input) => input.value === '3')!;
    await act(async () => { toggle.click(); });
    expect(daily.disabled).toBe(true);
    expect(daily.value).toBe('3');
    const form = container.querySelector('form')!;
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(api.updateSettings).toHaveBeenCalledWith('token', { ...settings, playNextCommand: false });
    expect(daily.value).toBe('3');
    expect(flash).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(flash).toHaveBeenCalledWith(expect.objectContaining({ tone: 'success' }));
    await act(async () => root.unmount());
    await flush();
});
