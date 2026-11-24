import { expect, it, vi } from 'vitest';
import { readInvite, readSession, matchesInvite } from './session';
import { createWebApi } from './api';

it('matches only the current invite and API origin', () => {
    const origin = 'https://api.example';
    const session = { token: 'credential', expiresAt: 100, inviteKey: 'a', origin };
    const storage = { getItem: () => JSON.stringify(session) };
    expect(readSession(storage, origin, 99)).toEqual(session);
    expect(readSession(storage, origin, 100)).toBeNull();
    expect(readSession(storage, 'https://other.example', 99)).toBeNull();
    expect(matchesInvite(session, 'b')).toBe(false);
    expect(readInvite('#bad')).toBeNull();
    expect(readInvite(`#${'a'.repeat(32)}`)).toBe('a'.repeat(32));
    expect(readSession({ getItem: () => '{' }, origin, 99)).toBeNull();
    expect(readSession({ getItem: () => { throw new Error('storage blocked'); } }, origin, 99)).toBeNull();
});

it('sends bearer credentials only in headers and preserves HTTP errors', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', {status: 401}));
    await expect(createWebApi('https://api.example', transport).state('private-token')).rejects.toMatchObject({ http: 401 });
    expect(transport).toHaveBeenCalledWith('https://api.example/api/web/v1/room', expect.objectContaining({ headers: { Authorization: 'Bearer private-token' } }));
});
