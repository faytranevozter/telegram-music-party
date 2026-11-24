import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Control, WebApi } from './api';
import { PlayerBar, controlLabels } from './PlaybackControls';
import { NowPlayingPanel, RoomPanelTabs, SearchResultsSkeleton, SearchTrackRow, SkipVoteProgress, SongSearchForm, UpNextPanel } from './RoomPanels';
import { RoomFlash, RoomHeader, type FlashMessage } from './RoomChrome';
import { OwnerSetup } from './OwnerSetup';
import './styles.css';
import previewCoverArt from './preview-cover-art.jpg';

const catalog = [
    { title: 'Dreams', artist: 'Fleetwood Mac', duration: '4:17', cover: 'left top' },
    { title: 'Never Gonna Give You Up', artist: 'Rick Astley', duration: '3:34', cover: 'right top' },
    { title: 'Together Forever', artist: 'Rick Astley', duration: '3:25', cover: 'right top' },
    { title: 'Whenever You Need Somebody', artist: 'Rick Astley', duration: '3:54', cover: 'right top' },
    { title: 'Take On Me', artist: 'a-ha', duration: '3:48', cover: 'left bottom' },
    { title: 'Everybody Wants to Rule the World', artist: 'Tears for Fears', duration: '4:12', cover: 'left top' },
    { title: 'September', artist: 'Earth, Wind & Fire', duration: '3:35', cover: 'right bottom' },
];
type Song = (typeof catalog)[number];

let sampleInvite: string | null = 'preview-only-not-a-real-inviteXY';
const previewSetup: Pick<WebApi, 'setup' | 'invite' | 'origin'> = {
    origin: 'https://player.example',
    setup: () => Promise.resolve({ roomId: 'office-music-demo', shareCode: sampleInvite }),
    invite: (_token, mode) => {
        sampleInvite = mode === 'disable' ? null : `preview-only-${crypto.randomUUID().replaceAll('-', '').slice(0, 19)}`;
        return Promise.resolve({ url: sampleInvite ? `${location.origin}/#${sampleInvite}` : null });
    },
};
const ignoreRevocation = () => undefined;

function Cover({ song, large = false }: { song: Song; large?: boolean }) {
    return <div className="avatar shrink-0" aria-hidden="true"><div className={`${large ? 'size-16 sm:size-20' : 'size-11'} rounded-lg bg-base-300`} style={{ background: `url(${previewCoverArt}) ${song.cover} / 200% 200%` }} /></div>;
}

function Preview() {
    const [query, setQuery] = useState('Rick Astley');
    const [host, setHost] = useState(false);
    const [submitted, setSubmitted] = useState(query);
    const [searching, setSearching] = useState(false);
    const searchTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(searchTimer.current), []);
    const [panel, setPanel] = useState<'search' | 'queue'>('search');
    const [queue, setQueue] = useState(catalog.slice(4));
    const [current, setCurrent] = useState<Song | null>(catalog[0]);
    const [paused, setPaused] = useState(false);
    const [muted, setMuted] = useState(false);
    const [previewRestrictions, setPreviewRestrictions] = useState(false);
    const [voted, setVoted] = useState(false);
    const [notice, setNotice] = useState<FlashMessage | null>(null);
    const dismiss = useCallback(() => setNotice(null), []);
    const showNotice = (text: string) => setNotice({ text, tone: 'success' });
    const results = catalog.filter(({ title, artist }) => `${title} ${artist}`.toLowerCase().includes(submitted));

    function control(action: Control) {
        if (action === 'mute' || action === 'unmute') setMuted(action === 'mute');
        if (action === 'play' || action === 'pause') setPaused(action === 'pause');
        if (action === 'next' && queue.length) { setCurrent(queue[0]); setQueue(queue.slice(1)); setPaused(false); setVoted(false); }
        if (action === 'previous') { setCurrent(catalog[0]); setPaused(false); setVoted(false); }
        if (action === 'radio') setQueue(catalog.slice(4));
        if (action === 'refresh') setQueue([]);
        showNotice(`${controlLabels[action]} selected in the preview.`);
    }

    function search(event: FormEvent) {
        event.preventDefault();
        window.clearTimeout(searchTimer.current);
        setSearching(true);
        searchTimer.current = window.setTimeout(() => {
            setSubmitted(query.trim().toLowerCase());
            setSearching(false);
        }, 650);
    }

    return <div className="frame">
        <header className="navbar min-h-0 border-b border-base-300 px-0 py-3">
            <span className="flex flex-1 items-center gap-2 font-bold"><img src="/music-party-mark.jpg" alt="" width="32" height="32" className="rounded-lg" /> Music Party</span>
            <span className="badge badge-outline">Design preview</span>
        </header>
        <main className="space-y-5">
            <RoomHeader name="Office Music" role={host ? 'Host' : 'Guest'} connection={{ label: 'Player connected', online: true }}>
                <label className="flex cursor-pointer items-center gap-2 text-sm"><span>Guest</span><input className="toggle toggle-primary toggle-sm" type="checkbox" aria-label="Preview as host" checked={host} onChange={(event) => setHost(event.target.checked)} /><span>Host</span></label>
            </RoomHeader>
            {host && <OwnerSetup api={previewSetup} token="preview" onRevoked={ignoreRevocation} onFlash={setNotice} />}
            <NowPlayingPanel cover={current && <Cover song={current} large />} status={paused ? 'Paused' : 'Now playing'} title={current?.title ?? 'Nothing playing yet'} description={current?.artist} controls={
                <PlayerBar paused={paused} muted={muted} onControl={control} disabledControls={previewRestrictions ? ['previous', 'next', 'mute', 'unmute', 'radio'] : []} />
            } />
            <label className="flex w-fit cursor-pointer items-center gap-2">
                <input type="checkbox" className="toggle toggle-sm" checked={previewRestrictions} onChange={(event) => setPreviewRestrictions(event.target.checked)} /> Preview disabled controls
            </label>
            <RoomPanelTabs panel={panel} count={queue.length} onChange={setPanel} />
            <div className="room-columns">
                <section className={`card border border-base-300 bg-base-100 ${panel === 'queue' ? 'hidden md:flex' : ''}`} aria-labelledby="sample-search-title">
                    <div className="card-body gap-4 p-4 sm:p-6">
                        <h2 id="sample-search-title">Find a song</h2>
                        <SongSearchForm query={query} searching={searching} onChange={(value) => { window.clearTimeout(searchTimer.current); setSearching(false); setQuery(value); }} onSearch={search} />
                        {searching ? <SearchResultsSkeleton /> : results.length ? <ul className="list -mx-2" aria-label="Search results">{results.map((song) => <SearchTrackRow key={song.title} cover={<Cover song={song} />} title={song.title} detail={`${song.artist} · ${song.duration}`} actions={
                            <button type="button" className="btn btn-primary btn-soft btn-sm" disabled={queue.includes(song)} aria-label={queue.includes(song) ? `${song.title} is queued` : `Add ${song.title} to queue`} onClick={() => { setQueue([...queue, song]); showNotice(`Added ${song.title} to the sample queue.`); }}>{queue.includes(song) ? 'Queued' : '+ Add'}</button>
                        } />)}</ul> : <p className="text-sm text-base-content/70">No sample tracks found. Try “Rick Astley” or “a-ha”.</p>}
                    </div>
                </section>
                <UpNextPanel hiddenOnMobile={panel === 'search'} tracks={queue.map((song) => ({ key: song.title, title: song.title, detail: `${song.artist} · ${song.duration}` }))}>
                    <SkipVoteProgress count={voted ? 3 : 2} required={5} />
                    <button className="btn btn-outline btn-sm" type="button" disabled={voted} onClick={() => { setVoted(true); showNotice('Vote added to the preview.'); }}>{voted ? 'Vote recorded' : 'Vote to skip'}</button>
                </UpNextPanel>
            </div>
            <p className="text-sm text-base-content/70">Sample tracks only. Actions reset when you refresh.</p>
            <RoomFlash message={notice} onDismiss={dismiss} />
        </main>
    </div>;
}

createRoot(document.getElementById('root')!).render(<Preview />);
