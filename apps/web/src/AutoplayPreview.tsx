import { useEffect, useState } from 'react';
import { ApiError, type AutoplayPreviewResult, type WebApi } from './api';
import { QueueTrackList } from './RoomPanels';
import { formatTrackDuration } from './track-art';

export function AutoplayPreview({ api, token, online, requestedCount, onRevoked }: { api: Pick<WebApi, 'autoplay'>; token: string; online: boolean; requestedCount: number; onRevoked: () => void }) {
    return <section className="space-y-2 border-t border-base-300 pt-3" aria-label="Autoplay">
        <h3 className="font-semibold">Autoplay <span className="text-sm font-normal text-base-content/70">· From YouTube Music</span></h3>
        {online ? <OnlinePreview key={token} api={api} token={token} start={requestedCount + 1} onRevoked={onRevoked} /> : <p className="text-sm text-base-content/70">Player offline.</p>}
    </section>;
}

function OnlinePreview({ api, token, start, onRevoked }: { api: Pick<WebApi, 'autoplay'>; token: string; start: number; onRevoked: () => void }) {
    const [preview, setPreview] = useState<AutoplayPreviewResult>();
    useEffect(() => {
        const request = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        async function refresh() {
            try {
                const result = await api.autoplay(token, request.signal);
                if (!request.signal.aborted) setPreview(result);
            } catch (error) {
                if (request.signal.aborted) return;
                if (error instanceof ApiError && error.http === 401) { onRevoked(); return; }
                setPreview({ status: 'unavailable' });
            }
            if (!request.signal.aborted) timer = setTimeout(() => void refresh(), 10_000);
        }
        void refresh();
        return () => { request.abort(); clearTimeout(timer); };
    }, [api, token, onRevoked]);

    if (preview?.status === 'ok' && preview.tracks.length) {
        return <QueueTrackList label="Upcoming autoplay tracks" start={start} tracks={preview.tracks.map(({ videoId, title, artist, durationSeconds }, index) => ({ key: `${index}:${videoId}`, title: title || 'Unknown track', detail: [artist, formatTrackDuration(durationSeconds)].filter(Boolean).join(' · ') }))} />;
    }
    return <p role="status" className="text-sm text-base-content/70">{!preview ? 'Loading autoplay…' : preview.status === 'ok' ? 'No upcoming autoplay tracks.' : preview.status === 'offline' ? 'Player offline.' : 'Autoplay preview is unavailable.'}</p>;
}
