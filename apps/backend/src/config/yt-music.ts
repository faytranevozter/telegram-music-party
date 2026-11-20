export interface YTMusicLocale {
    /** ISO 3166-1 alpha-2 region used for the search catalog. */
    location: string;
    /** YouTube content language (`hl`). */
    lang: string;
}

const DEFAULT_LOCATION = 'ID';
const DEFAULT_LANG = 'en';

/**
 * Region and language only shape what the search provider returns. Playback
 * availability is still decided by the connected player's own account region,
 * so a result can be listed here and refused by the player.
 *
 * Errors intentionally contain no configuration values.
 */
export function ytMusicLocale(
    env: NodeJS.ProcessEnv = process.env,
): YTMusicLocale {
    const location = (env.YT_MUSIC_LOCATION ?? DEFAULT_LOCATION)
        .trim()
        .toUpperCase();
    const lang = (env.YT_MUSIC_LANG ?? DEFAULT_LANG).trim();
    if (!/^[A-Z]{2}$/.test(location))
        throw new Error('Invalid YT_MUSIC_LOCATION configuration');
    if (!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(lang))
        throw new Error('Invalid YT_MUSIC_LANG configuration');
    return { location, lang };
}
