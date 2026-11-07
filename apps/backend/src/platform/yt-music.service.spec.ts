import { Logger } from '@nestjs/common';
import Keyv from 'keyv';
import { YTMusicService, VideoSearchClient } from './yt-music.service';

class TestService extends YTMusicService {
    readonly initialize = jest.fn<Promise<VideoSearchClient>, []>();
    protected createClient() {
        return this.initialize();
    }
}

const pipedResponse = (ids = ['lYBUbBu4W08']) => ({
    ok: true,
    status: 200,
    json: () =>
        Promise.resolve({
            items: ids.map((id, index) => ({
                url: `/watch?v=${id}`,
                type: 'stream',
                title: `Title ${index}`,
                uploaderName: 'Artist',
                duration: 214,
            })),
        }),
});

describe('song search availability', () => {
    let service: TestService;
    let videoSearch: jest.Mock;
    let fetchMock: jest.Mock;
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        service = new TestService(new Keyv());
        videoSearch = jest.fn().mockResolvedValue({ videos: [] });
        service.initialize.mockResolvedValue({ search: videoSearch });
    });
    afterEach(() => {
        global.fetch = originalFetch;
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('uses Piped for songs and caches normalized queries', async () => {
        fetchMock.mockResolvedValue(pipedResponse());
        expect(await service.searchSongs('  Rick   Astley  ')).toHaveLength(1);
        expect(await service.searchSongs('rick astley')).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://pipedapi.ducks.party/search?q=Rick%20Astley&filter=music_songs',
            expect.objectContaining({
                headers: { Accept: 'application/json' },
            }),
        );
        expect(service.initialize).not.toHaveBeenCalled();
    });
    it('falls back to the next Piped instance', async () => {
        fetchMock
            .mockResolvedValueOnce({ ok: false, status: 502 })
            .mockResolvedValueOnce(pipedResponse());
        expect(await service.searchSongs('hello')).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('api.piped.private.coffee/search'),
            expect.anything(),
        );
    });
    it('uses ordinary YouTube video search only when requested', async () => {
        videoSearch.mockResolvedValue({
            videos: [{ video_id: 'dQw4w9WgXcQ', title: { text: 'Title' } }],
        });
        const results = await service.searchSongs('Rick Astley', 'video');
        expect(videoSearch).toHaveBeenCalledWith('Rick Astley', {
            type: 'video',
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(service.initialize).toHaveBeenCalledTimes(1);
        expect(results[0]).toMatchObject({
            videoId: 'dQw4w9WgXcQ',
            channelName: 'Unknown channel',
        });
    });
    it('keeps song and video cache entries separate', async () => {
        fetchMock.mockResolvedValue(pipedResponse());
        videoSearch.mockResolvedValue({ videos: [] });
        await service.searchSongs('Rick Astley', 'song');
        await service.searchSongs('Rick Astley', 'video');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(videoSearch).toHaveBeenCalledTimes(1);
    });
    it('survives initialization failure and retries only after cooldown', async () => {
        service.initialize.mockRejectedValueOnce(new Error('offline'));
        expect(await service.searchSongs('hello', 'video')).toEqual([]);
        expect(await service.searchSongs('hello', 'video')).toEqual([]);
        expect(service.initialize).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(5001);
        expect(await service.searchSongs('hello', 'video')).toEqual([]);
        expect(service.initialize).toHaveBeenCalledTimes(2);
        expect(videoSearch).toHaveBeenCalledTimes(1);
    });
    it('pauses songs after a provider failure without pausing videos', async () => {
        fetchMock.mockRejectedValue(new Error('offline'));
        expect(await service.searchSongs('hello')).toEqual([]);
        expect(await service.searchSongs('other query')).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(await service.searchSongs('hello', 'video')).toEqual([]);
        expect(service.initialize).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(5001);
        await service.searchSongs('hello');
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    it('honours a longer cooldown for HTTP 429', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 429 });
        expect(await service.searchSongs('hello')).toEqual([]);
        expect(await service.searchSongs('other query')).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(30_001);
        await service.searchSongs('hello');
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    it.each(['initialization', 'search'])(
        'bounds a stalled %s and settles late rejection',
        async (phase) => {
            let reject!: (error: Error) => void;
            const stalled = new Promise<never>((_, fail) => {
                reject = fail;
            });
            if (phase === 'initialization')
                service.initialize.mockReturnValueOnce(stalled);
            else fetchMock.mockReturnValueOnce(stalled);
            const result = service.searchSongs(
                'hello',
                phase === 'initialization' ? 'video' : 'song',
            );
            await jest.advanceTimersByTimeAsync(16_001);
            expect(await result).toEqual([]);
            reject(new Error('late failure'));
            await jest.advanceTimersByTimeAsync(5001);
            await service.searchSongs(
                'hello',
                phase === 'initialization' ? 'video' : 'song',
            );
            expect(jest.getTimerCount()).toBe(0);
        },
    );
    it('handles empty/malformed provider responses', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ items: [] }),
        });
        expect(await service.searchSongs('empty')).toEqual([]);
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({}),
        });
        expect(await service.searchSongs('malformed')).toEqual([]);
    });
    it('coalesces queries and limits concurrent provider work', async () => {
        fetchMock.mockRejectedValue(new Error('offline'));
        const requests = ['one', 'one', 'two', 'three', 'four', 'five'].map(
            (query) => service.searchSongs(query),
        );
        expect(await Promise.all(requests)).toEqual([[], [], [], [], [], []]);
        expect(fetchMock).toHaveBeenCalledTimes(8);
    });
    it('does not mask cache/programming errors as provider outages', async () => {
        const cache = new Keyv();
        jest.spyOn(cache, 'get').mockRejectedValue(new Error('cache bug'));
        await expect(
            new TestService(cache).searchSongs('hello'),
        ).rejects.toThrow('cache bug');
    });
});
