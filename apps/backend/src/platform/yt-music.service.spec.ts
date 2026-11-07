import { Logger } from '@nestjs/common';
import Keyv from 'keyv';
import { ENV } from '../config/env';
import { YTMusicService, VideoSearchClient } from './yt-music.service';

class TestService extends YTMusicService {
    readonly initialize = jest.fn<Promise<VideoSearchClient>, []>();
    protected createClient() {
        return this.initialize();
    }
}

const song = (id = 'dQw4w9WgXcQ') => ({
    item_type: 'song',
    id,
    title: 'Title',
    artists: [{ name: 'Artist' }],
});

describe('song search availability', () => {
    let service: TestService;
    let songSearch: jest.Mock;
    let videoSearch: jest.Mock;
    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
        service = new TestService(new Keyv());
        songSearch = jest.fn().mockResolvedValue({ songs: { contents: [] } });
        videoSearch = jest.fn().mockResolvedValue({ videos: [] });
        service.initialize.mockResolvedValue({
            search: videoSearch,
            music: { search: songSearch },
        });
    });
    afterEach(() => {
        ENV.REMOTE_SEARCH.enabled = false;
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('uses remote songs and videos without local fallback, with independent cooldowns', async () => {
        ENV.REMOTE_SEARCH.enabled = true;
        ENV.REMOTE_SEARCH.url = 'https://search.example/api/search';
        ENV.REMOTE_SEARCH.token = 'test-token';
        const http = jest
            .spyOn(global, 'fetch')
            .mockRejectedValueOnce(new Error('private details'))
            .mockResolvedValue(
                new Response(JSON.stringify({ results: [] }), {
                    headers: { 'content-type': 'application/json' },
                }),
            );
        expect(await service.searchSongs('hello')).toEqual([]);
        expect(await service.searchSongs('hello', 'video')).toEqual([]);
        expect(http).toHaveBeenCalledTimes(2);
        expect(service.initialize).not.toHaveBeenCalled();
        expect(songSearch).not.toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Jest spy assertion, never invoked
        expect(Logger.prototype.warn).toHaveBeenCalledWith(
            'Search failed (song): network',
        );
    });

    it('defaults to song-only search and caches normalized queries', async () => {
        expect(service.initialize).not.toHaveBeenCalled();
        songSearch.mockResolvedValue({ songs: { contents: [song()] } });
        expect(await service.searchSongs('  Rick   Astley  ')).toHaveLength(1);
        expect(await service.searchSongs('rick astley')).toHaveLength(1);
        expect(songSearch).toHaveBeenCalledTimes(1);
        expect(songSearch).toHaveBeenCalledWith('Rick Astley', {
            type: 'song',
        });
        expect(videoSearch).not.toHaveBeenCalled();
        expect(service.initialize).toHaveBeenCalledTimes(1);
    });
    it('keeps results for ten minutes then refreshes them', async () => {
        songSearch.mockResolvedValue({ songs: { contents: [song()] } });
        await service.searchSongs('hello');
        jest.advanceTimersByTime(10 * 60_000 - 1);
        expect(await service.searchSongs('hello')).toHaveLength(1);
        expect(songSearch).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(2);
        expect(await service.searchSongs('hello')).toHaveLength(1);
        expect(songSearch).toHaveBeenCalledTimes(2);
    });
    it('caches successful empty results', async () => {
        expect(await service.searchSongs('empty')).toEqual([]);
        jest.advanceTimersByTime(60_000);
        expect(await service.searchSongs(' EMPTY ')).toEqual([]);
        expect(songSearch).toHaveBeenCalledTimes(1);
    });
    it('caches remote results across normalized repeated queries', async () => {
        ENV.REMOTE_SEARCH.enabled = true;
        ENV.REMOTE_SEARCH.url = 'https://search.example/api/search';
        ENV.REMOTE_SEARCH.token = 'test-token';
        const results = [
            {
                videoId: 'dQw4w9WgXcQ',
                title: 'Title',
                artistName: 'Artist',
                channelName: null,
                durationSeconds: null,
                thumbnailUrl: null,
            },
        ];
        const http = jest.spyOn(global, 'fetch').mockImplementation(async () =>
            new Response(JSON.stringify({ results }), {
                headers: { 'content-type': 'application/json' },
            }),
        );
        expect(await service.searchSongs(' Hello   World ')).toEqual(results);
        jest.advanceTimersByTime(60_000);
        expect(await service.searchSongs('hello world')).toEqual(results);
        expect(http).toHaveBeenCalledTimes(1);
    });
    it('searches ordinary videos when requested and caches them separately', async () => {
        videoSearch.mockResolvedValue({
            videos: [{ video_id: 'dQw4w9WgXcQ', title: { text: 'Title' } }],
        });
        const results = await service.searchSongs('Rick Astley', 'video');
        expect(videoSearch).toHaveBeenCalledWith('Rick Astley', {
            type: 'video',
        });
        expect(songSearch).not.toHaveBeenCalled();
        expect(results[0]).toMatchObject({
            videoId: 'dQw4w9WgXcQ',
            channelName: 'Unknown channel',
        });
        await service.searchSongs('Rick Astley', 'song');
        expect(songSearch).toHaveBeenCalledTimes(1);
    });
    it('survives initialization failure and retries only after cooldown', async () => {
        service.initialize.mockRejectedValueOnce(new Error('offline'));
        expect(await service.searchSongs('hello')).toEqual([]);
        expect(await service.searchSongs('hello')).toEqual([]);
        expect(service.initialize).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(5001);
        expect(await service.searchSongs('hello')).toEqual([]);
        expect(service.initialize).toHaveBeenCalledTimes(2);
        expect(songSearch).toHaveBeenCalledTimes(1);
    });
    it.each([
        new Error('network'),
        { status: 429 },
        { info: { status_code: 429 } },
    ])('handles external failure %j', async (error) => {
        songSearch.mockRejectedValueOnce(error);
        expect(await service.searchSongs('hello')).toEqual([]);
        expect(await service.searchSongs('other query')).toEqual([]);
        expect(songSearch).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(30_001);
        await service.searchSongs('hello');
        expect(songSearch).toHaveBeenCalledTimes(2);
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
            else songSearch.mockReturnValueOnce(stalled);
            const result = service.searchSongs('hello');
            await jest.advanceTimersByTimeAsync(8001);
            expect(await result).toEqual([]);
            reject(new Error('late failure'));
            await jest.advanceTimersByTimeAsync(5001);
            await service.searchSongs('hello');
            expect(jest.getTimerCount()).toBe(0);
        },
    );
    it('handles empty/malformed provider responses', async () => {
        expect(await service.searchSongs('empty')).toEqual([]);
        songSearch.mockResolvedValueOnce({});
        expect(await service.searchSongs('malformed')).toEqual([]);
    });
    it('coalesces queries and limits concurrent provider work', async () => {
        songSearch.mockReturnValue(new Promise(() => undefined));
        const requests = ['one', 'one', 'two', 'three', 'four', 'five'].map(
            (query) => service.searchSongs(query),
        );
        await jest.advanceTimersByTimeAsync(8001);
        expect(await Promise.all(requests)).toEqual([[], [], [], [], [], []]);
        expect(songSearch).toHaveBeenCalledTimes(4);
    });
    it('does not mask cache/programming errors as provider outages', async () => {
        const cache = new Keyv();
        jest.spyOn(cache, 'get').mockRejectedValue(new Error('cache bug'));
        await expect(
            new TestService(cache).searchSongs('hello'),
        ).rejects.toThrow('cache bug');
    });
});
