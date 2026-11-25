export interface Join {
    id: string;
    browser: string;
    fingerprint: string;
}

export type PlayerQueueItem = {
    durationSeconds?: number;
    url: string;
    title: string;
    artist: string;
    current: boolean;
};

export type PlayerQueueResult =
    | { status: 'ok'; items: PlayerQueueItem[] }
    | { status: 'offline' | 'unavailable' | 'timeout' };

export function validatePlayerQueue(value: unknown): PlayerQueueResult {
    if (!value || typeof value !== 'object') return { status: 'unavailable' };
    const data = value as Record<string, unknown>;
    if (
        data.available !== true ||
        !Array.isArray(data.items) ||
        data.items.length > 10000
    ) {
        return { status: 'unavailable' };
    }
    const items: PlayerQueueItem[] = [];
    for (const entry of data.items) {
        if (!entry || typeof entry !== 'object')
            return { status: 'unavailable' };
        const item = entry as Record<string, unknown>;
        if (
            typeof item.url !== 'string' ||
            !/^[\w-]{1,128}$/.test(item.url) ||
            typeof item.title !== 'string' ||
            item.title.length > 1000 ||
            typeof item.artist !== 'string' ||
            item.artist.length > 1000 ||
            typeof item.current !== 'boolean'
        )
            return { status: 'unavailable' };
        items.push({
            url: item.url,
            title: item.title,
            artist: item.artist,
            current: item.current,
            ...(typeof item.durationSeconds === 'number' && Number.isSafeInteger(item.durationSeconds) && item.durationSeconds > 0
                ? { durationSeconds: item.durationSeconds }
                : {}),
        });
    }
    return { status: 'ok', items };
}

export type AutoplayResult =
    | { status: 'ok'; videoId: string; song: string; artist: string }
    | {
          status: 'no-current-song' | 'unavailable' | 'offline' | 'timeout';
      };

export function validateAutoplayResult(value: unknown): AutoplayResult {
    if (!value || typeof value !== 'object') return { status: 'unavailable' };
    const data = value as Record<string, unknown>;
    if (data.status === 'no-current-song' || data.status === 'unavailable') {
        return { status: data.status };
    }
    if (data.status !== 'ok') return { status: 'unavailable' };
    if (
        typeof data.videoId !== 'string' ||
        !/^[\w-]{1,128}$/.test(data.videoId) ||
        typeof data.song !== 'string' ||
        data.song.length > 1000 ||
        typeof data.artist !== 'string' ||
        data.artist.length > 1000
    ) {
        return { status: 'unavailable' };
    }
    return {
        status: 'ok',
        videoId: data.videoId,
        song: data.song,
        artist: data.artist,
    };
}

export type PlaybackNotification =
    | { type: 'queue-empty' }
    | { type: 'now-playing'; song: string; artist: string }
    | { type: 'paused'; song: string; artist: string }
    | { type: 'resumed'; song: string; artist: string }
    | {
          type: 'volume-changed';
          direction: 'increased' | 'decreased';
          volume: number;
      }
    | { type: 'mute-changed'; muted: boolean }
    | { type: 'lyrics'; text: string | null }
    /** The player refused a requested track, usually by region restriction. */
    | { type: 'queue-unavailable'; song: string; videoId: string };

export type PlaybackNotificationPayload = PlaybackNotification & {
    roomId: string;
};

export type PlayerState = {
    state: 'playing' | 'paused' | 'standby';
    volume: number | null;
    muted: boolean | null;
};

export function validatePlayerState(data: unknown) {
    if (!data || typeof data !== 'object') return null;
    const { roomId, state, videoId, song, artist, volume, muted } =
        data as Record<string, unknown>;
    if (
        typeof roomId !== 'string' ||
        !roomId ||
        (state !== 'playing' && state !== 'paused' && state !== 'standby') ||
        (videoId !== null &&
            (typeof videoId !== 'string' || !/^[\w-]{11}$/.test(videoId))) ||
        (state === 'standby' && videoId !== null) ||
        typeof song !== 'string' ||
        typeof artist !== 'string' ||
        (volume !== null &&
            (typeof volume !== 'number' ||
                !Number.isFinite(volume) ||
                volume < 0 ||
                volume > 100)) ||
        (muted !== null && typeof muted !== 'boolean')
    ) {
        return null;
    }
    return {
        roomId,
        state,
        videoId,
        song: song.slice(0, 300),
        artist: artist.slice(0, 300),
        volume,
        muted,
    } as const;
}
