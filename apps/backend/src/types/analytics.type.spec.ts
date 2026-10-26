import { validatePlaybackReport } from './analytics.type';

const base = () => ({
    roomId: 'room-1',
    playbackId: 'playback-1',
    videoId: 'dQw4w9WgXcQ',
    title: 'Song',
    artist: 'Artist',
    durationMs: 200_000,
    source: 'requested',
    event: 'start',
    startedAt: new Date().toISOString(),
    listenedMs: 0,
});

describe('validatePlaybackReport', () => {
    it('accepts a well-formed start report', () => {
        const payload = base();
        expect(validatePlaybackReport(payload)).toEqual({
            roomId: 'room-1',
            playbackId: 'playback-1',
            videoId: 'dQw4w9WgXcQ',
            requestId: null,
            title: 'Song',
            artist: 'Artist',
            durationMs: 200_000,
            source: 'requested',
            event: 'start',
            startedAt: payload.startedAt,
            endedAt: null,
            listenedMs: 0,
            endReason: null,
        });
    });

    it('accepts end reports with a reason and timestamp', () => {
        const report = validatePlaybackReport({
            ...base(),
            event: 'end',
            endReason: 'completed',
            endedAt: new Date().toISOString(),
        });
        expect(report?.endReason).toBe('completed');
        expect(report?.endedAt).toEqual(expect.any(String));
    });

    it('drops end data from progress reports', () => {
        const report = validatePlaybackReport({
            ...base(),
            event: 'progress',
            endReason: 'completed',
        });
        expect(report?.endReason).toBeNull();
        expect(report?.endedAt).toBeNull();
    });

    it('defaults an unknown source and reason instead of rejecting', () => {
        const report = validatePlaybackReport({
            ...base(),
            source: 'something-else',
            event: 'end',
            endReason: 'something-else',
        });
        expect(report?.source).toBe('unknown');
        expect(report?.endReason).toBe('unknown');
    });

    it.each([
        null,
        {},
        { ...base(), roomId: '' },
        { ...base(), playbackId: 'has spaces' },
        { ...base(), videoId: '' },
        { ...base(), event: 'pause' },
        { ...base(), startedAt: 'not-a-date' },
        {
            ...base(),
            startedAt: new Date(
                Date.now() - 8 * 24 * 60 * 60 * 1000,
            ).toISOString(),
        },
        {
            ...base(),
            startedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        { ...base(), listenedMs: Number.NaN },
    ])('rejects malformed reports', (value) => {
        expect(validatePlaybackReport(value)).toBeNull();
    });

    it('clamps long text and ignores an invalid request ID', () => {
        const report = validatePlaybackReport({
            ...base(),
            title: 'x'.repeat(1000),
            artist: 'y'.repeat(1000),
            requestId: 'not a valid id',
        });
        expect(report?.title).toHaveLength(300);
        expect(report?.artist).toHaveLength(300);
        expect(report?.requestId).toBeNull();
    });
});
