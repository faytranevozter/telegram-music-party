import {
    creditLabel,
    normalizeSongs,
    normalizeVideos,
    SearchProviderError,
} from './video-search';

const video = (overrides = {}) => ({
    video_id: 'dQw4w9WgXcQ',
    title: { text: 'Never Gonna Give You Up' },
    author: { name: 'Rick Astley' },
    duration: { text: '3:33', seconds: 213 },
    thumbnails: [
        { url: 'https://img.test/small', width: 120 },
        { url: 'https://img.test/large', width: 480 },
    ],
    ...overrides,
});

const song = (overrides = {}) => ({
    item_type: 'song',
    id: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    artists: [{ name: 'Rick Astley', channel_id: 'UC123' }],
    duration: { text: '3:33', seconds: 213 },
    thumbnails: [
        { url: 'https://img.test/small', width: 120 },
        { url: 'https://img.test/large', width: 480 },
    ],
    ...overrides,
});

describe('ordinary video normalization', () => {
    it('supports the pinned release video lockup shape without treating view counts as channels', () => {
        const lockup = {
            type: 'LockupView',
            content_type: 'VIDEO',
            content_id: 'dQw4w9WgXcQ',
            metadata: {
                title: { text: 'Title' },
                metadata: {
                    metadata_rows: [
                        {
                            metadata_parts: [
                                { text: { text: '1M views' } },
                                {
                                    text: {
                                        text: 'Channel',
                                        endpoint: {
                                            payload: { browseId: 'UC123' },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            },
            content_image: {
                image: [{ url: 'https://img.test/a', width: 480 }],
            },
            duration: { text: '3:33', seconds: 213 },
        };
        expect(normalizeVideos({ videos: [lockup] })[0]).toMatchObject({
            videoId: 'dQw4w9WgXcQ',
            title: 'Title',
            artistName: null,
            channelName: 'Channel',
            durationSeconds: 213,
        });
        expect(
            normalizeVideos({
                videos: [{ ...lockup, content_type: 'PLAYLIST' }],
            }),
        ).toEqual([]);
    });
    it('keeps channel separate and chooses the largest safe thumbnail', () => {
        expect(normalizeVideos({ videos: [video()] })).toEqual([
            {
                videoId: 'dQw4w9WgXcQ',
                title: 'Never Gonna Give You Up',
                artistName: null,
                channelName: 'Rick Astley',
                durationSeconds: 213,
                thumbnailUrl: 'https://img.test/large',
            },
        ]);
    });
    it('rejects invalid IDs/titles, deduplicates, and tolerates malformed entries', () => {
        expect(
            normalizeVideos({
                videos: [
                    null,
                    {},
                    video({ video_id: 'bad' }),
                    video({ title: {} }),
                    video(),
                    video(),
                ],
            }),
        ).toHaveLength(1);
    });
    it.each([
        [{ text: '1:02:03' }, 3723],
        [{ seconds: 42 }, 42],
        [{ text: 'LIVE', seconds: 0 }, null],
        [{ seconds: NaN }, null],
        [null, null],
        [{ seconds: -1 }, null],
        [{ text: '2:99' }, null],
    ])('handles duration %j', (duration, expected) => {
        expect(
            normalizeVideos({ videos: [video({ duration })] })[0]
                .durationSeconds,
        ).toBe(expected);
    });
    it('uses explicit nulls and a display fallback for absent metadata', () => {
        expect(
            normalizeVideos({
                videos: [
                    video({
                        author: null,
                        thumbnails: [{ url: 'javascript:bad' }],
                        duration: null,
                    }),
                ],
            })[0],
        ).toMatchObject({
            channelName: 'Unknown channel',
            thumbnailUrl: null,
            durationSeconds: null,
        });
    });
    it('returns empty for a valid empty response but marks invalid structures', () => {
        expect(normalizeVideos({ videos: [] })).toEqual([]);
        expect(() => normalizeVideos({})).toThrow(SearchProviderError);
    });
    it('caps results at 20 without fetching continuations', () => {
        expect(
            normalizeVideos({
                videos: Array.from({ length: 30 }, (_, i) =>
                    video({ video_id: String(i).padStart(11, '0') }),
                ),
            }),
        ).toHaveLength(20);
    });
});

describe('YouTube Music song normalization', () => {
    it('keeps only audio-track songs with artist metadata', () => {
        expect(
            normalizeSongs({
                songs: {
                    contents: [
                        song(),
                        {
                            ...song({ id: 'abcdefghijk' }),
                            item_type: 'video',
                        },
                    ],
                },
            }),
        ).toEqual([
            {
                videoId: 'dQw4w9WgXcQ',
                title: 'Never Gonna Give You Up',
                artistName: 'Rick Astley',
                channelName: null,
                durationSeconds: 213,
                thumbnailUrl: 'https://img.test/large',
            },
        ]);
    });
    it('finds songs inside contents shelves even without the named getter', () => {
        expect(
            normalizeSongs({
                contents: [
                    { contents: [song()] },
                    { contents: [{ item_type: 'album', id: 'MPR123' }] },
                ],
            }),
        ).toHaveLength(1);
    });
    it('joins multiple artists and tolerates missing metadata', () => {
        expect(
            normalizeSongs({
                songs: {
                    contents: [
                        song({
                            artists: [
                                { name: 'Artist A' },
                                { name: 'Artist B' },
                            ],
                        }),
                        song({
                            id: 'abcdefghijk',
                            artists: [],
                            duration: null,
                            thumbnails: [{ url: 'javascript:bad' }],
                        }),
                    ],
                },
            }),
        ).toMatchObject([
            { artistName: 'Artist A, Artist B' },
            {
                artistName: null,
                durationSeconds: null,
                thumbnailUrl: null,
            },
        ]);
    });
    it('deduplicates, rejects malformed rows and caps at 20', () => {
        expect(
            normalizeSongs({
                songs: {
                    contents: [
                        null,
                        {},
                        song({ id: 'bad' }),
                        song({ title: '' }),
                        song(),
                        song(),
                        ...Array.from({ length: 30 }, (_, i) =>
                            song({ id: String(i).padStart(11, '0') }),
                        ),
                    ],
                },
            }),
        ).toHaveLength(20);
        expect(normalizeSongs({ songs: { contents: [] } })).toEqual([]);
        expect(normalizeSongs({ contents: [] })).toEqual([]);
        expect(() => normalizeSongs({})).toThrow(SearchProviderError);
    });
    it('labels song artists and video channels differently', () => {
        expect(
            creditLabel({
                videoId: 'dQw4w9WgXcQ',
                title: 'Song',
                artistName: 'Artist',
                channelName: null,
                durationSeconds: null,
                thumbnailUrl: null,
            }),
        ).toBe('Artist: Artist');
        expect(
            creditLabel({
                videoId: 'dQw4w9WgXcQ',
                title: 'Video',
                artistName: null,
                channelName: 'Channel',
                durationSeconds: null,
                thumbnailUrl: null,
            }),
        ).toBe('Channel: Channel');
    });
});
