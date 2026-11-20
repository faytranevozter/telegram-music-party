import { ytMusicLocale } from './yt-music';

describe('ytMusicLocale', () => {
    it('defaults to the Indonesian catalog with English labels', () => {
        expect(ytMusicLocale({})).toEqual({ location: 'ID', lang: 'en' });
    });

    it('normalizes a configured region and keeps the language', () => {
        expect(
            ytMusicLocale({ YT_MUSIC_LOCATION: ' us ', YT_MUSIC_LANG: 'en' }),
        ).toEqual({ location: 'US', lang: 'en' });
    });

    it('accepts a regional language variant', () => {
        expect(
            ytMusicLocale({ YT_MUSIC_LOCATION: 'ID', YT_MUSIC_LANG: 'en-GB' }),
        ).toEqual({ location: 'ID', lang: 'en-GB' });
    });

    it.each([
        { YT_MUSIC_LOCATION: 'Indonesia' },
        { YT_MUSIC_LOCATION: 'I' },
        { YT_MUSIC_LOCATION: '' },
    ])('rejects an invalid region: %o', (env) => {
        expect(() => ytMusicLocale(env)).toThrow(
            'Invalid YT_MUSIC_LOCATION configuration',
        );
    });

    it.each([
        { YT_MUSIC_LANG: 'english' },
        { YT_MUSIC_LANG: 'EN' },
        { YT_MUSIC_LANG: '' },
    ])('rejects an invalid language: %o', (env) => {
        expect(() => ytMusicLocale(env)).toThrow(
            'Invalid YT_MUSIC_LANG configuration',
        );
    });
});
