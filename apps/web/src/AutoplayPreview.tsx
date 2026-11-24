import { useEffect, useState } from 'react';
import { ApiError, type AutoplayPreviewResult, type WebApi } from './api';

export function AutoplayPreview({ api, token, online, onRevoked }: { api: Pick<WebApi, 'autoplay'>; token: string; online: boolean; onRevoked: () => void }) {
    return <section className="space-y-2 border-t border-base-300 pt-3" aria-label="Autoplay">
        <h3 className="font-semibold">Autoplay <span className="text-sm font-normal text-base-content/70">· From YouTube Music</span></h3>
        {online ? <OnlinePreview key={token} api={api} token={token} onRevoked={onRevoked} /> : <p className="text-sm text-base-content/70">Player offline.</p>}
    </section>;
}

function OnlinePreview({ api, token, onRevoked }: { api: Pick<WebApi, 'autoplay'>; token: string; onRevoked: () => void }) {
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
        return <ol className="list" aria-label="Upcoming autoplay tracks">{preview.tracks.map(({ videoId, title, artist }, index) => <li key={`${index}:${videoId}`} className="list-row grid-cols-[auto_minmax(0,1fr)] gap-2 px-0 py-2">
            <span aria-hidden="true" className="text-sm tabular-nums text-base-content/65">{index + 1}.</span>
            <div className="min-w-0"><p className="break-words font-medium">{title || 'Unknown track'}</p>{artist && <p className="break-words text-sm text-base-content/70">{artist}</p>}</div>
        </li>)}</ol>;
    }
    return <p role="status" className="text-sm text-base-content/70">{!preview ? 'Loading autoplay…' : preview.status === 'ok' ? 'No upcoming autoplay tracks.' : preview.status === 'offline' ? 'Player offline.' : 'Autoplay preview is unavailable.'}</p>;
}
