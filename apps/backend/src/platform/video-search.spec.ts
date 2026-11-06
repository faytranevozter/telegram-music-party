import { normalizeVideos, SearchProviderError } from './video-search';

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
