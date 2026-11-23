import { creditLabel } from 'src/platform/video-search';
import { formatDuration } from 'src/helpers/util';
import type { Song } from 'src/types/cache.type';

export type SongLabel = {
    credit: string;
    duration: string;
    plain: string;
};

/**
 * The plain "title - credit [duration]" string that is stored on the queue row,
 * sent to the player and echoed back in chat.
 */
export function describeSongPlain(song: Song): SongLabel {
    const credit = creditLabel(song);
    const duration =
        song.durationSeconds == null
            ? 'Duration unavailable'
            : formatDuration(song.durationSeconds);
    return {
        credit,
        duration,
        plain: `${song.title} - ${credit} [${duration}]`,
    };
}
