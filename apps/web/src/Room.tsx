import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, explain, type Control, type Selection, type WebApi } from './api';
import { OwnerSetup } from './OwnerSetup';
import { useRoom } from './use-room';

const labels: Record<Control, string> = {play: 'Play', pause: 'Pause', next: 'Next', previous: 'Previous', radio: 'Start radio', refresh: 'Refresh player queue', mute: 'Mute', unmute: 'Unmute', 'volume-up': 'Volume up', 'volume-down': 'Volume down'};

export function Room({ api, token, onLeave, onRevoked }: {api: WebApi; token: string; onLeave: () => void; onRevoked: () => void}) {
    const { state, live, error, refresh } = useRoom(api, token, onRevoked);
    const [query, setQuery] = useState('');
    const [type, setType] = useState<'song' | 'video'>('song');
    const [results, setResults] = useState<Selection[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [confirmLeave, setConfirmLeave] = useState(false);
    const pending = useRef<AbortController | undefined>(undefined);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); }; }, []);
    function resetSearch() { pending.current?.abort(); setSearching(false); setResults(null); }
    async function search(event: FormEvent) {
        event.preventDefault();
        resetSearch();
        const abort = new AbortController();
        pending.current = abort; setSearching(true); setFeedback('');
        try {
            const found = await api.search(token, query.trim(), state?.capabilities.videoSearch ? type : 'song', abort.signal);
            if (!abort.signal.aborted) setResults(found);
        } catch (cause) {
            if (!abort.signal.aborted) report(cause, 'Search is unavailable. Try again.');
        } finally { if (!abort.signal.aborted) setSearching(false); }
    }
    function report(cause: unknown, fallback?: string) {
        if (cause instanceof ApiError && cause.http === 401) onRevoked();
        else setFeedback(explain(cause, fallback));
    }
    async function act(action: () => Promise<string>, fallback?: string) {
        if (busy) return;
        setBusy(true); setFeedback('');
        try { const message = await action(); if (mounted.current) { setFeedback(message); refresh(); } }
        catch (cause) { if (mounted.current) report(cause, fallback); }
        finally { if (mounted.current) setBusy(false); }
    }
    return <section className="room">
        <div className="room-heading"><h1>{state?.name ?? 'Listening room'}</h1><button onClick={() => state?.role === 'owner' || !state ? setConfirmLeave(true) : onLeave()}>Leave room</button></div>
        {confirmLeave && <div className="notice"><p>Leaving clears your session in this tab. If you own the room, you won’t be able to recover owner access.</p><div className="actions"><button onClick={onLeave}>Confirm leave</button><button onClick={() => setConfirmLeave(false)}>Stay in room</button></div></div>}
        {error && <div className="notice" role="alert">{error} <button onClick={refresh}>Retry connection</button></div>}
        {!state ? !error && <p role="status">Opening the room…</p> : <>
            <section className="playing" aria-label="Now playing">
                <div className="playing-mark" aria-hidden="true"><span>◉</span></div>
                <div><div className="connection" aria-live="polite">{live ? 'Live updates on' : 'Live updates disconnected'}</div>
                    {!live && !error && <button onClick={refresh}>Reconnect live updates</button>}
                    <h2>{state.nowPlaying?.title ?? (state.playerOnline ? 'Nothing playing yet' : 'Player offline')}</h2>
                    <p>{state.nowPlaying?.artist || (state.playerOnline ? 'Songs play through the host’s extension.' : 'You can still add songs to the queue.')}</p>
                    <div className="actions">{state.capabilities.controls.map((action) => <button key={action} disabled={busy || !state.playerOnline} onClick={() => void act(async () => { await api.control(token, action); return `${labels[action]} sent to player.`; })}>{labels[action]}</button>)}</div>
                </div>
            </section>
            <p className="feedback" role="status">{feedback}</p>
            <div className="room-columns">
                <section aria-labelledby="search-title"><h2 id="search-title">Find a song</h2>
                    <form className="search" onSubmit={search}>
                        <label>Song or artist<input id="song-query" type="search" required value={query} maxLength={200} onChange={(event) => { resetSearch(); setQuery(event.target.value); }} /></label>
                        {state.capabilities.videoSearch && <label>Search in<select value={type} onChange={(event) => { resetSearch(); setType(event.target.value === 'video' ? 'video' : 'song'); }}><option value="song">Songs</option><option value="video">Videos</option></select></label>}
                        <button className="primary" disabled={searching || query.trim().length < 3}>{searching ? 'Searching…' : 'Search'}</button>
                    </form>
                    {results?.length === 0 && <p>No results. Try a different song or artist.</p>}
                    <ul className="tracks">{results?.map((song) => <li key={song.selectionId}><div><strong>{song.title}</strong><p>{song.artistName ?? song.channelName ?? 'Unknown artist'}</p></div><div className="actions">
                        <button disabled={busy} onClick={() => void act(async () => { await api.queue(token, song.selectionId, 'end'); return 'Added to the shared queue.'; }, 'Could not add this result. Search again if the selection has expired.')}>Add to queue</button>
                        {state.capabilities.playNext && <button disabled={busy || state.capabilities.playNextRemaining === 0} onClick={() => void act(async () => { await api.queue(token, song.selectionId, 'next'); return 'Added to Play Next.'; }, 'Could not add this result. Search again if the selection has expired.')}>Play Next</button>}
                    </div></li>)}</ul>
                    {state.capabilities.playNext && state.capabilities.playNextRemaining !== null && <p>Play Next uses left today: {state.capabilities.playNextRemaining}</p>}
                </section>
                <section aria-labelledby="queue-title"><h2 id="queue-title">Shared queue <span className="count">{state.queue.length}</span></h2>
                    {state.queue.length ? <ol className="queue">{state.queue.map((track, index) => <li key={`${track.videoId}:${index}`}>{track.title}</li>)}</ol> : <p>No songs queued. Add one from search.</p>}
                    <button disabled={busy || !state.playerOnline} onClick={() => void act(async () => { const result = await api.vote(token); return result.status === 'passed' ? 'The room voted to skip.' : `Vote recorded (${result.count}/${result.required}).`; })}>Vote to skip</button>
                </section>
            </div>
            {state.role === 'owner' && <OwnerSetup api={api} token={token} onRevoked={onRevoked} />}
        </>}
    </section>;
}
