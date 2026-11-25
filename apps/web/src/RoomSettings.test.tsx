// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, createWebApi, explain } from './api';
import { RoomSettings } from './RoomSettings';

const settings = { maxQueueSize: 10, minimumVotes: 2, playNextCommand: true, dailyPlayNextLimit: 3, allowVideoSearch: false, guestRequestLimit: 0, guestRequestPeriodMinutes: 10 };

it('preserves the guest quota retry time without changing other limit messages', async () => {
    const retryAt = Date.UTC(2026, 10, 25, 12, 30);
    const transport = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ status: 'guest-request-limit', retryAt }) });
    const api = createWebApi('https://example.test', transport as typeof fetch);
    const error = await api.queue('token', 'selection', 'end').catch((cause: unknown) => cause);
    expect(error).toMatchObject({ retryAt });
    expect(explain(error)).toContain(new Date(retryAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
    expect(explain(new ApiError(429))).toBe('Too many requests. Wait a minute and try again.');
    expect(explain(new ApiError(409, 'limit-reached'))).toBe('You’ve used today’s Play Next allowance.');
});
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

it('shows current settings with accessible labels and numeric limits', async () => {
    const api = { settings: vi.fn().mockResolvedValue(settings), updateSettings: vi.fn() };
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<RoomSettings api={api} token="token" onRevoked={vi.fn()} onFlash={vi.fn()} />); });
    const labels = [...container.querySelectorAll('label')];
    expect(labels.map((label) => label.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Maximum queue size'), expect.stringContaining('Votes needed to skip'), expect.stringContaining('Allow Play Next'), expect.stringContaining('Daily Play Next limit'), expect.stringContaining('Allow video search')]));
    const numbers = [...container.querySelectorAll<HTMLInputElement>('input[type=number]')];
    expect(numbers.map((input) => [input.value, input.min, input.max])).toEqual([['10', '1', '2147483647'], ['2', '1', '2147483647'], ['3', '0', '2147483647'], ['0', '0', '100'], ['10', '1', '1440']]);
    expect(numbers[4].disabled).toBe(false);
    expect(container.textContent).toContain('0 means unlimited');
    await act(async () => root.unmount());
});

it('saves the selected room-wide requester display mode', async () => {
    const api = { settings: vi.fn().mockResolvedValue({ ...settings, requesterDisplay: 'name' }), updateSettings: vi.fn().mockResolvedValue({ ...settings, requesterDisplay: 'anonymous' }) };
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<RoomSettings api={api} token="token" onRevoked={vi.fn()} onFlash={vi.fn()} />); });
    const select = container.querySelector('select')!;
    expect(select.value).toBe('name');
    expect([...select.options].map((option) => option.text)).toEqual(['Hidden', 'Anonymous', 'Show names']);
    await act(async () => {
        select.value = 'anonymous';
        select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(api.updateSettings).toHaveBeenCalledWith('token', { ...settings, requesterDisplay: 'anonymous' });
    await act(async () => root.unmount());
});

it('offers retry after loading fails and restores the form', async () => {
    const api = { settings: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(settings), updateSettings: vi.fn() };
    const flash = vi.fn();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<RoomSettings api={api} token="token" onRevoked={vi.fn()} onFlash={flash} />); });
    expect(container.textContent).toContain('Retry loading settings');
    await act(async () => { container.querySelector('button')!.click(); });
    expect(container.querySelector('form')).not.toBeNull();
    expect(flash).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
    await act(async () => root.unmount());
});

it('revokes the session after an unauthorized save', async () => {
    const api = { settings: vi.fn().mockResolvedValue(settings), updateSettings: vi.fn().mockRejectedValue(new ApiError(401)) };
    const revoked = vi.fn();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<RoomSettings api={api} token="token" onRevoked={revoked} onFlash={vi.fn()} />); });
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(revoked).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
});

it('revokes the session after an unauthorized load', async () => {
    const api = { settings: vi.fn().mockRejectedValue(new ApiError(401)), updateSettings: vi.fn() };
    const revoked = vi.fn();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<RoomSettings api={api} token="token" onRevoked={revoked} onFlash={vi.fn()} />); });
    expect(revoked).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
});

it('ignores a pending load after unmount', async () => {
    let fail!: (reason: unknown) => void;
    const api = { settings: vi.fn().mockReturnValue(new Promise((_resolve, reject) => { fail = reject; })), updateSettings: vi.fn() };
    const revoked = vi.fn(); const flash = vi.fn();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<RoomSettings api={api} token="token" onRevoked={revoked} onFlash={flash} />); });
    expect(container.textContent).toContain('Loading settings');
    await act(async () => root.unmount());
    await act(async () => fail(new ApiError(401)));
    expect(revoked).not.toHaveBeenCalled();
    expect(flash).not.toHaveBeenCalled();
});

it('ignores a pending save after unmount', async () => {
    let finish!: (value: typeof settings) => void;
    const api = { settings: vi.fn().mockResolvedValue(settings), updateSettings: vi.fn().mockReturnValue(new Promise<typeof settings>((resolve) => { finish = resolve; })) };
    const flash = vi.fn();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<RoomSettings api={api} token="token" onRevoked={vi.fn()} onFlash={flash} />); });
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
    await act(async () => root.unmount());
    await act(async () => finish(settings));
    expect(flash).not.toHaveBeenCalled();
});

it('rejects invalid numeric drafts without saving', async () => {
    const api = { settings: vi.fn().mockResolvedValue(settings), updateSettings: vi.fn() };
    const flash = vi.fn();
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    await act(async () => { root.render(<RoomSettings api={api} token="token" onRevoked={vi.fn()} onFlash={flash} />); });
    const input = container.querySelector<HTMLInputElement>('input[type=number]')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '0');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(api.updateSettings).not.toHaveBeenCalled();
    expect(flash).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
    await act(async () => root.unmount());
});
