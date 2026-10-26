import { validatePlayerQueue, validateAutoplayResult } from './playback.type';

describe('validatePlayerQueue', () => {
    it('preserves duplicates and selection', () => {
        const item = {
            url: 'abc',
            title: '<Song>',
            artist: 'Artist',
            current: true,
        };
        expect(
            validatePlayerQueue({ available: true, items: [item, item] }),
        ).toEqual({ status: 'ok', items: [item, item] });
    });

    it('accepts a genuinely empty queue', () => {
        expect(validatePlayerQueue({ available: true, items: [] })).toEqual({
            status: 'ok',
            items: [],
        });
    });

    it.each([
        null,
        {},
        { available: false, items: [] },
        { available: true, items: [{}] },
        { available: true, items: new Array(10001).fill({}) },
    ])('rejects unavailable and malformed responses', (response) => {
        expect(validatePlayerQueue(response)).toEqual({
            status: 'unavailable',
        });
    });
});

describe('validateAutoplayResult', () => {
    it('accepts a successful refresh with the seeded song', () => {
        expect(
            validateAutoplayResult({
                status: 'ok',
                videoId: 'dQw4w9WgXcQ',
                song: 'Never Gonna Give You Up',
                artist: 'Rick Astley',
            }),
        ).toEqual({
            status: 'ok',
            videoId: 'dQw4w9WgXcQ',
            song: 'Never Gonna Give You Up',
            artist: 'Rick Astley',
        });
    });

    it('passes through player-side failure states', () => {
        expect(validateAutoplayResult({ status: 'no-current-song' })).toEqual({
            status: 'no-current-song',
        });
        expect(validateAutoplayResult({ status: 'unavailable' })).toEqual({
            status: 'unavailable',
        });
    });

    it.each([
        null,
        {},
        { status: 'offline' },
        { status: 'ok', videoId: '', song: 'Song', artist: 'Artist' },
        { status: 'ok', videoId: 'abc', song: 1, artist: 'Artist' },
    ])('rejects malformed responses', (response) => {
        expect(validateAutoplayResult(response)).toEqual({
            status: 'unavailable',
        });
    });
});
