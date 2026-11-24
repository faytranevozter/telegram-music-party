import type { FormEvent, ReactNode } from 'react';

type RoomPanel = 'search' | 'queue';

export function RoomPanelTabs({ panel, count, onChange }: { panel: RoomPanel; count: number; onChange: (panel: RoomPanel) => void }) {
    return <div className="tabs tabs-box md:hidden" role="group" aria-label="Room view">
        <button type="button" className={`tab ${panel === 'search' ? 'tab-active' : ''}`} aria-pressed={panel === 'search'} onClick={() => onChange('search')}>Find a song</button>
        <button type="button" className={`tab ${panel === 'queue' ? 'tab-active' : ''}`} aria-pressed={panel === 'queue'} onClick={() => onChange('queue')}>Up next <span className="badge badge-sm ml-2">{count}</span></button>
    </div>;
}

export function SongSearchForm({ query, searching = false, onChange, onSearch, children }: {
    query: string;
    searching?: boolean;
    onChange: (query: string) => void;
    onSearch: (event: FormEvent<HTMLFormElement>) => void;
    children?: ReactNode;
}) {
    return <form onSubmit={onSearch}>
        <div className="join flex w-full">
            <input className="input join-item min-w-0 flex-1" type="search" aria-label="Song or artist" placeholder="Song or artist" required maxLength={200} value={query} onChange={(event) => onChange(event.target.value)} />
            <button className="btn btn-primary join-item shrink-0" disabled={searching || [...query.trim()].length < 3}>{searching ? 'Searching…' : 'Search'}</button>
        </div>
        {children}
    </form>;
}

export function NowPlayingPanel({ cover, status = 'Now playing', title, description, controls }: {
    cover?: ReactNode;
    status?: string;
    title: string;
    description?: string;
    controls: ReactNode;
}) {
    return <section className="card bg-neutral text-neutral-content" aria-label="Now playing">
        <div className="card-body flex-row items-center gap-4 p-4 sm:p-5">
            {cover}
            <div className="min-w-0 grow">
                <p className="text-sm opacity-80">{status}</p>
                <h2>{title}</h2>
                {description && <p className="text-sm opacity-80">{description}</p>}
            </div>
        </div>
        <div className="px-4 pb-4 sm:px-5">{controls}</div>
    </section>;
}

export function SearchTrackRow({ cover, title, detail, actions }: {
    cover: ReactNode;
    title: string;
    detail: string;
    actions: ReactNode;
}) {
    return <li className="list-row grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        {cover}
        <div className="min-w-0"><p className="break-words font-semibold">{title}</p><p className="break-words text-sm text-base-content/70">{detail}</p></div>
        <div className="flex flex-col items-end gap-1">{actions}</div>
    </li>;
}

export function SearchResultsSkeleton() {
    return <div role="status">
        <span className="sr-only">Loading search results</span>
        <ul className="list -mx-2" aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => <li key={index} className="list-row grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <div className="skeleton size-11 rounded-lg motion-reduce:animate-none" />
                <div className="grid min-w-0 gap-2">
                    <div className="skeleton h-3 w-4/5 max-w-44 motion-reduce:animate-none" />
                    <div className="skeleton h-2.5 w-1/2 max-w-28 motion-reduce:animate-none" />
                </div>
                <div className="skeleton h-8 w-16 rounded-field motion-reduce:animate-none" />
            </li>)}
        </ul>
    </div>;
}

type QueueDisplayTrack = { key: string; title: string; detail?: string };

export function SkipVoteProgress({ count, required }: { count: number; required: number }) {
    return <div className="grid w-full gap-2">
        <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">Skip vote</span>
            <span className="tabular-nums text-base-content/75" role="status">{count} / {required} votes</span>
        </div>
        <progress className="progress progress-primary h-1.5 w-full" aria-label="Skip vote progress" max={required} value={Math.min(count, required)} />
    </div>;
}

export function UpNextPanel({ tracks, hiddenOnMobile, children }: {
    tracks: readonly QueueDisplayTrack[];
    hiddenOnMobile: boolean;
    children: ReactNode;
}) {
    return <section className={`card border border-base-300 bg-base-100 ${hiddenOnMobile ? 'hidden md:flex' : ''}`} aria-label="Up next">
        <div className="card-body gap-4 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2"><h2>Up next</h2><span className="badge badge-outline">{tracks.length} {tracks.length === 1 ? 'song' : 'songs'}</span></div>
            {tracks.length ? <ol className="list -mx-2" aria-label="Playback order">
                {tracks.map(({ key, title, detail }, index) => <li className="list-row grid-cols-[2rem_minmax(0,1fr)] items-center gap-3" key={key}>
                    <span aria-hidden="true" className="text-center text-sm tabular-nums text-base-content/65">{String(index + 1).padStart(2, '0')}</span>
                    <div className="min-w-0"><p className="break-words font-semibold">{title}</p>{detail && <p className="break-words text-sm text-base-content/70">{detail}</p>}{index === 0 && <span className="badge badge-primary badge-soft badge-sm mt-1">Next to play</span>}</div>
                </li>)}
            </ol> : <p className="text-sm text-base-content/70">No songs queued. Add one from search.</p>}
            <div className="card-actions flex-col items-start gap-3 border-t border-base-300 pt-4">{children}</div>
        </div>
    </section>;
}
