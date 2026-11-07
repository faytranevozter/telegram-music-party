import { remoteSearchConfig } from '../config/remote-search';
import { parseRemoteResults, searchRemote } from './remote-search';

const config = {
    enabled: true,
    url: 'https://search.example/api/search',
    token: 'secret',
    bypass: 'bypass',
    timeoutMs: 100,
};
const row = {
    videoId: 'dQw4w9WgXcQ',
    title: 'Title',
    artistName: null,
    channelName: null,
    durationSeconds: 214,
    thumbnailUrl: null,
};

describe('private remote search', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });
    it('validates enabled config without exposing values', () => {
        expect(remoteSearchConfig({}).enabled).toBe(false);
        for (const url of [
            'http://host/path',
            'https://user:password@host',
            'https://host/#fragment',
            'https://host/?token=secret',
        ]) {
            expect(() =>
                remoteSearchConfig({
                    YTMUSIC_SEARCH_ENABLED: 'true',
                    YTMUSIC_SEARCH_URL: url,
                    YTMUSIC_SEARCH_TOKEN: 'secret',
                }),
            ).toThrow('Invalid remote search configuration');
        }
        expect(() =>
            remoteSearchConfig({ YTMUSIC_SEARCH_ENABLED: 'true' }),
        ).toThrow();
    });
    it('sends both headers, type, and refuses redirects', async () => {
        const mock = jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ results: [row] }), {
                headers: { 'content-type': 'application/json' },
            }),
        );
        expect(await searchRemote(config, 'hello', 'video')).toEqual([row]);
        expect(mock).toHaveBeenCalledWith(
            config.url,
            expect.objectContaining({
                redirect: 'error',
                body: JSON.stringify({ query: 'hello', type: 'video' }),
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer secret',
                    'x-vercel-protection-bypass': 'bypass',
                },
            }),
        );
    });
    it.each([
        [401, 'authentication'],
        [403, 'authentication'],
        [429, 'rate-limit'],
        [503, 'rate-limit'],
        [504, 'timeout'],
        [400, 'invalid-request'],
        [502, 'network'],
    ])('classifies HTTP %s', async (status, kind) => {
        jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response('{}', {
                status: status,
                headers: { 'content-type': 'application/json' },
            }),
        );
        await expect(
            searchRemote(config, 'hello', 'song'),
        ).rejects.toMatchObject({ kind });
    });
    it('recognizes platform protection HTML', async () => {
        jest.spyOn(global, 'fetch').mockResolvedValue(
            new Response('<html>login</html>', {
                headers: { 'content-type': 'text/html' },
            }),
        );
        await expect(
            searchRemote(config, 'hello', 'song'),
        ).rejects.toMatchObject({ kind: 'protection' });
    });
    it('accepts genuine empty results but rejects malformed, duplicate and unsafe rows', () => {
        expect(parseRemoteResults({ results: [] })).toEqual([]);
        for (const payload of [
            {},
            { results: [null] },
            { results: [row, row] },
            { results: [{ ...row, durationSeconds: Infinity }] },
            { results: [{ ...row, thumbnailUrl: 'http://unsafe' }] },
            { results: Array(21).fill(row) },
        ]) {
            expect(() => parseRemoteResults(payload)).toThrow();
        }
    });
    it('rejects oversized and malformed bodies', async () => {
        const fetchMock = jest.spyOn(global, 'fetch');
        for (const body of ['not json', 'x'.repeat(129 * 1024)]) {
            fetchMock.mockResolvedValue(
                new Response(body, {
                    headers: { 'content-type': 'application/json' },
                }),
            );
            await expect(
                searchRemote(config, 'hello', 'song'),
            ).rejects.toMatchObject({ kind: 'malformed' });
        }
    });
    it.each(['fetch', 'body'])(
        'bounds stalled %s even when implementation ignores abort',
        async (phase) => {
            jest.useFakeTimers();
            const stalled = new Promise<Response>(() => undefined);
            jest.spyOn(global, 'fetch').mockReturnValue(
                phase === 'fetch'
                    ? stalled
                    : Promise.resolve(
                          new Response(new ReadableStream({ start() {} }), {
                              headers: { 'content-type': 'application/json' },
                          }),
                      ),
            );
            const result = searchRemote(config, 'hello', 'song');
            const assertion = expect(result).rejects.toMatchObject({
                kind: 'timeout',
            });
            await jest.advanceTimersByTimeAsync(101);
            await assertion;
            expect(jest.getTimerCount()).toBe(0);
        },
    );
});
