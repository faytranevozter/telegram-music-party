export type Control = 'play' | 'pause' | 'next' | 'previous' | 'radio' | 'refresh' | 'mute' | 'unmute' | 'volume-up' | 'volume-down';
export type Track = { title: string; videoId: string };
export type RoomState = {
    name: string; role: 'owner' | 'guest'; queue: Track[]; playerOnline: boolean;
    nowPlaying: (Track & { artist: string }) | null;
    capabilities: { controls: Control[]; playNext: boolean; playNextRemaining: number | null; videoSearch: boolean };
};
export type Selection = Track & {selectionId: string; artistName: string | null; channelName: string | null};
type Admission = { token: string; expiresAt: number; room: {name: string} };
export type Setup = { roomId: string; shareCode: string | null };

export class ApiError extends Error {
    constructor(readonly http: number, readonly status?: string) { super(`Room request failed (${http})`); }
}

export function createWebApi(origin: string, transport: typeof fetch = fetch) {
    async function request<T>(path: string, token?: string, data?: object, signal?: AbortSignal): Promise<T> {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (data) headers['Content-Type'] = 'application/json';
        const response = await transport(`${origin}/api/web/v1/${path}`, {
            method: data ? 'POST' : 'GET', headers, body: data ? JSON.stringify(data) : undefined,
            signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
        });
        if (!response.ok) {
            const detail: unknown = await response.json().catch(() => null);
            const status = detail && typeof detail === 'object' && 'status' in detail && typeof detail.status === 'string' ? detail.status : undefined;
            throw new ApiError(response.status, status);
        }
        return await response.json() as T;
    }
    return {
        origin,
        join: (shareCode: string, nickname: string) => request<Admission>('rooms/join', undefined, { shareCode, nickname }),
        create: (name: string, nickname: string) => request<Admission & Setup>('rooms', undefined, { name, nickname }),
        state: (token: string, signal?: AbortSignal) => request<RoomState>('room', token, undefined, signal),
        search: (token: string, query: string, type: 'song' | 'video', signal?: AbortSignal) => request<Selection[]>('room/search', token, { query, type }, signal),
        queue: (token: string, selectionId: string, position: 'end' | 'next') => request('room/requests', token, { selectionId, position }),
        vote: (token: string) => request<{status: 'passed' | 'counted'; count?: number; required?: number}>('room/votes/next', token, {}),
        control: (token: string, action: Control) => request('room/control', token, { action }),
        setup: (token: string, signal?: AbortSignal) => request<Setup>('room/setup', token, undefined, signal),
        invite: (token: string, mode: 'enable' | 'rotate' | 'disable') => request<{url: string | null}>('room/invite', token, { mode }),
    };
}

export type WebApi = ReturnType<typeof createWebApi>;

export function explain(error: unknown, fallback = 'Could not reach the party server. Try again.') {
    if (!(error instanceof ApiError)) return fallback;
    const messages: Record<string, string> = {
        'queue-full': 'The queue is full. Try again after a song starts.',
        duplicate: 'That song is already in the queue.',
        'limit-reached': 'You’ve used today’s Play Next allowance.',
        'player-offline': 'The player went offline. Try again when it reconnects.',
        'already-voted': 'You’ve already voted to skip this song.',
        'skip-pending': 'The player is already moving to the next song.',
    };
    if (error.status && Object.hasOwn(messages, error.status)) return messages[error.status];
    if (error.http === 429) return 'Too many requests. Wait a minute and try again.';
    if (error.http === 401) return 'Your room session ended. Ask for a current invite to rejoin.';
    if (error.http === 403) return 'That action isn’t available in this room.';
    return fallback;
}
