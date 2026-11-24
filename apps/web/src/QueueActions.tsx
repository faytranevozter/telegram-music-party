export function QueueActions({ title, queued, busy, playNext, remaining, onAdd }: { title: string; queued: boolean; busy: boolean; playNext: boolean; remaining: number | null; onAdd: (position: 'end' | 'next') => void }) {
    return <>
        <button type="button" className="btn btn-primary btn-soft btn-sm" disabled={busy || queued} title={queued ? 'Already queued' : 'Add to queue'} aria-label={queued ? `${title} is queued` : `Add ${title} to queue`} onClick={() => onAdd('end')}>
            <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h10M4 10h10M4 14h6M18 12v8M14 16h8" /></svg>{queued ? 'Queued' : 'Queue'}
        </button>
        {playNext && !queued && <button type="button" className="btn btn-outline btn-sm" disabled={busy || remaining === 0} title="Play Next" aria-label={`Play ${title} next`} onClick={() => onAdd('next')}>
            <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h11M4 10h11M4 14h6M14 14l5 3-5 3z" /></svg>Next
        </button>}
    </>;
}
