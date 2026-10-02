export interface Join {
    id: string;
    browser: string;
    fingerprint: string;
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
