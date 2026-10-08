import { validatePlayerQueue } from './playback.type';

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
