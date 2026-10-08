export interface Join {
    id: string;
    browser: string;
    fingerprint: string;
}

export type PlayerQueueItem = {
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
        });
    }
    return { status: 'ok', items };
}

export type PlaybackNotification =
    | { type: 'queue-empty' }
    | { type: 'now-playing'; song: string; artist: string }
    | { type: 'paused'; song: string; artist: string }
    | {
          type: 'volume-changed';
          direction: 'increased' | 'decreased';
          volume: number;
      }
    | { type: 'mute-changed'; muted: boolean }
    | { type: 'lyrics'; text: string | null };

export type PlaybackNotificationPayload = PlaybackNotification & {
    roomId: string;
};
