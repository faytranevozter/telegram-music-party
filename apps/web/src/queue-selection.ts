import { ApiError, type Selection, type WebApi } from './api';

export type SelectionSearch = { query: string; type: 'song' | 'video' };

export async function queueSelection(api: Pick<WebApi, 'queue' | 'search'>, token: string, track: Selection, position: 'end' | 'next', search: SelectionSearch, signal?: AbortSignal) {
    try {
        await api.queue(token, track.selectionId, position);
        return;
    } catch (cause) {
        if (!(cause instanceof ApiError) || cause.http !== 404 || cause.status !== 'selection-not-found') throw cause;
    }

    signal?.throwIfAborted();
    const results = await api.search(token, search.query, search.type, signal);
    signal?.throwIfAborted();
    const refreshed = results.find((result) => result.videoId === track.videoId);
    if (!refreshed) throw new ApiError(404, 'track-unavailable');
    await api.queue(token, refreshed.selectionId, position);
}
