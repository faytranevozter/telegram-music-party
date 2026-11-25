import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ApiError, explain, type Control, type Selection, type WebApi } from './api';
import { OwnerSetup } from './OwnerSetup';
import { RoomSettings } from './RoomSettings';
import { useRoom } from './use-room';
import { TrackCover } from './TrackCover';
import { coverSources, formatTrackDuration, queueTrackDisplay } from './track-art';

import { controlLabels, PlayerBar } from './PlaybackControls';
import { NowPlayingPanel, RoomPanelTabs, SearchResultsSkeleton, SearchTrackRow, SkipVoteProgress, SongSearchForm, UpNextPanel } from './RoomPanels';
import { RoomFlash, RoomHeader, type FlashMessage } from './RoomChrome';
import { queueSelection, type SelectionSearch } from './queue-selection';
import { QueueActions } from './QueueActions';
import { AutoplayPreview } from './AutoplayPreview';

const playbackActions = Object.keys(controlLabels) as Control[];
const desktopQuery = '(min-width: 48rem)';
function watchDesktop(onChange: () => void) {
    const media = window.matchMedia?.(desktopQuery);
    media?.addEventListener('change', onChange);
    return () => media?.removeEventListener('change', onChange);
}
const isDesktop = () => window.matchMedia?.(desktopQuery).matches ?? false;

export function Room({ api, token, onLeave, onRevoked }: {api: WebApi; token: string; onLeave: () => void; onRevoked: () => void}) {
    const { state, live, error, refresh } = useRoom(api, token, onRevoked);
    const [query, setQuery] = useState('');
    const [type, setType] = useState<'song' | 'video'>('song');
    const [results, setResults] = useState<Selection[] | null>(null);
    const [selectionSearch, setSelectionSearch] = useState<SelectionSearch | null>(null);
    const [searching, setSearching] = useState(false);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<FlashMessage | null>(null);
    const dismissFeedback = useCallback(() => setFeedback(null), []);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [panel, setPanel] = useState<'search' | 'queue'>('search');
    const [showAutoplay, setShowAutoplay] = useState(false);
    const desktop = useSyncExternalStore(watchDesktop, isDesktop, () => false);
    const pending = useRef<AbortController | undefined>(undefined);
    const pendingSelection = useRef<AbortController | undefined>(undefined);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.abort(); pendingSelection.current?.abort(); }; }, []);
    function resetSearch() { pending.current?.abort(); setSearching(false); setResults(null); }
    async function search(event: FormEvent) {
        event.preventDefault();
        resetSearch();
        const abort = new AbortController();
        pending.current = abort; setSearching(true); setFeedback(null);
        try {
            const selection: SelectionSearch = { query: query.trim(), type: state?.capabilities.videoSearch ? type : 'song' };
            const found = await api.search(token, selection.query, selection.type, abort.signal);
            if (!abort.signal.aborted) { setResults(found); setSelectionSearch(selection); }
        } catch (cause) {
            if (!abort.signal.aborted) report(cause, 'Search is unavailable. Try again.');
        } finally { if (!abort.signal.aborted) setSearching(false); }
    }
    function report(cause: unknown, fallback?: string) {
        if (cause instanceof ApiError && cause.http === 401) onRevoked();
        else setFeedback({ text: explain(cause, fallback), tone: 'error' });
    }
    async function act(action: () => Promise<string>, fallback?: string) {
        if (busy) return;
        setBusy(true); setFeedback(null);
        try { const message = await action(); if (mounted.current) { setFeedback({ text: message, tone: 'success' }); refresh(); } }
        catch (cause) { if (mounted.current) report(cause, fallback); }
        finally { if (mounted.current) setBusy(false); }
    }
    function addTrack(song: Selection, position: 'end' | 'next') {
        if (!selectionSearch || busy) return;
        const request = new AbortController();
        pendingSelection.current = request;
        void act(async () => {
            await queueSelection(api, token, song, position, selectionSearch, request.signal);
            return position === 'next' ? 'Added to Play Next.' : 'Added to the shared queue.';
        }, 'Could not add this track. Try again.');
    }
    const playerState = state?.playerOnline ? state.playerState : null;
    const playbackStatus = playerState?.state === 'paused' ? 'Paused'
        : playerState?.state === 'playing' ? 'Now playing'
        : playerState?.state === 'standby' ? 'Standing by'
        : 'Playback status unavailable';
    const volumeStatus = playerState?.volume != null ? ` · Volume: ${playerState.volume}%` : '';
    const muteStatus = playerState?.muted ? ' · Muted' : '';
    return <section className="room">
        <RoomHeader name={state?.name ?? 'Listening room'} role={state ? state.role === 'owner' ? 'Host' : 'Guest' : undefined} connection={state ? { label: state.playerOnline ? 'Player connected' : 'Player offline', online: state.playerOnline } : undefined}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => state?.role === 'owner' || !state ? setConfirmLeave(true) : onLeave()}>Leave room</button>
        </RoomHeader>
        {state?.role === 'owner' && <OwnerSetup api={api} token={token} onRevoked={onRevoked} onFlash={setFeedback}><RoomSettings api={api} token={token} onRevoked={onRevoked} onFlash={setFeedback} /></OwnerSetup>}
        {confirmLeave && <div className="alert alert-warning"><p>Leaving clears your session in this tab. If you own the room, you won’t be able to recover owner access.</p><div className="actions"><button className="btn btn-sm" onClick={onLeave}>Confirm leave</button><button className="btn btn-ghost btn-sm" onClick={() => setConfirmLeave(false)}>Stay in room</button></div></div>}
        {error && <div className="alert alert-error" role="alert">{error} <button className="btn btn-sm" onClick={refresh}>Retry connection</button></div>}
        {!state ? !error && <p role="status">Opening the room…</p> : <>
            <NowPlayingPanel
                cover={state.nowPlaying && <TrackCover key={state.nowPlaying.videoId} videoId={state.nowPlaying.videoId} large />}
                artworkSource={state.playerOnline ? coverSources(state.nowPlaying?.videoId)[0] : undefined}
                status={`${playbackStatus}${volumeStatus}${muteStatus}`}
                title={state.nowPlaying?.title ?? (state.playerOnline ? 'Nothing playing yet' : 'Player offline')}
                description={state.nowPlaying?.artist || (state.playerOnline ? 'Songs play through the host’s extension.' : 'You can still add songs to the queue.')}
                controls={<PlayerBar
                        paused={playerState ? playerState.state !== 'playing' : state.playerOnline ? null : true}
                        muted={playerState?.muted ?? false}
                        disabled={busy || !state.playerOnline}
                        disabledControls={playbackActions.filter((action) => !state.capabilities.controls.includes(action))}
                        onControl={(action) => void act(async () => {
                            await api.control(token, action);
                            return `${controlLabels[action]} sent to player.`;
                        })}
                />}
            />
            {!live && !error && <div className="flex flex-wrap items-center gap-2 text-sm"><span role="status">Live updates disconnected</span><button className="btn btn-outline btn-sm" onClick={refresh}>Reconnect live updates</button></div>}
            <RoomPanelTabs panel={panel} count={state.queue.length} onChange={setPanel} />
            <div className="room-columns">
                <section className={`card border border-base-300 bg-base-100 ${panel !== 'search' ? 'hidden md:flex' : ''}`} aria-labelledby="search-title"><div className="card-body gap-4 p-4 sm:p-6"><h2 id="search-title">Find a song</h2>
                    <SongSearchForm query={query} searching={searching} onChange={(value) => { resetSearch(); setQuery(value); }} onSearch={search}>
                        {state.capabilities.videoSearch && <select aria-label="Search type" className="select join-item w-auto shrink-0" value={type} onChange={(event) => { resetSearch(); setType(event.target.value === 'video' ? 'video' : 'song'); }}><option value="song">Songs</option><option value="video">Videos</option></select>}
                    </SongSearchForm>
                    {results?.length === 0 && <p>No results. Try a different song or artist.</p>}
                    {results === null && !searching && <p className="text-sm text-base-content/70">Search for a song or artist to add something to the room.</p>}
                    {searching ? <SearchResultsSkeleton /> : <ul className="list -mx-2" aria-label="Search results">{results?.map((song) => {
                        const duration = formatTrackDuration(song.durationSeconds);
                        const queued = state.queue.some((track) => track.videoId === song.videoId);
                        return <SearchTrackRow key={song.selectionId} cover={<TrackCover videoId={song.videoId} thumbnailUrl={song.thumbnailUrl} />} title={song.title} detail={`${song.artistName ?? song.channelName ?? 'Unknown artist'}${duration ? ` · ${duration}` : ''}`} actions={<QueueActions title={song.title} queued={queued} busy={busy} playNext={state.capabilities.playNext} remaining={state.capabilities.playNextRemaining} onAdd={(position) => addTrack(song, position)} />} />; })}</ul>}
                    {state.capabilities.playNext && state.capabilities.playNextRemaining !== null && <p>Play Next uses left today: {state.capabilities.playNextRemaining}</p>}
                </div></section>
                <UpNextPanel hiddenOnMobile={panel !== 'queue'} tracks={state.queue.map((track, index) => ({ key: `${track.videoId}:${index}`, ...queueTrackDisplay(track.title), requesterLabel: track.requesterLabel }))}
                    autoplayToggle={<label className="flex w-fit items-center gap-2 text-sm"><input className="toggle toggle-sm" type="checkbox" checked={showAutoplay} onChange={(event) => setShowAutoplay(event.target.checked)} /> Show autoplay</label>}
                    autoplayPreview={showAutoplay && (desktop || panel === 'queue') && <AutoplayPreview api={api} token={token} online={state.playerOnline} requestedCount={state.queue.length} onRevoked={onRevoked} />}>
                    {state.voteProgress && <SkipVoteProgress count={state.voteProgress.count} required={state.voteProgress.required} />}
                    <button className="btn btn-outline btn-sm" disabled={busy || !state.playerOnline || state.voteProgress?.hasVoted} onClick={() => void act(async () => { const result = await api.vote(token); return result.status === 'passed' ? 'The room voted to skip.' : `Vote recorded (${result.count}/${result.required}).`; })}>{state.voteProgress?.hasVoted ? 'Vote recorded' : 'Vote to skip'}</button>
                </UpNextPanel>
            </div>
        </>}
        <RoomFlash message={feedback} onDismiss={dismissFeedback} />
    </section>;
}
