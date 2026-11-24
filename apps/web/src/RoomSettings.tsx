import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, explain, type RoomSettings as Settings, type WebApi } from './api';
import type { FlashMessage } from './RoomChrome';

type Draft = Omit<Settings, 'maxQueueSize' | 'minimumVotes' | 'dailyPlayNextLimit'> & { maxQueueSize: string; minimumVotes: string; dailyPlayNextLimit: string };
const draftOf = (value: Settings): Draft => ({ ...value, maxQueueSize: String(value.maxQueueSize), minimumVotes: String(value.minimumVotes), dailyPlayNextLimit: String(value.dailyPlayNextLimit) });

export function RoomSettings({ api, token, onRevoked, onFlash }: { api: Pick<WebApi, 'settings' | 'updateSettings'>; token: string; onRevoked: () => void; onFlash: (message: FlashMessage) => void }) {
    const [draft, setDraft] = useState<Draft>();
    const [attempt, setAttempt] = useState(0);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        const abort = new AbortController();
        void api.settings(token, abort.signal).then((value) => { if (!abort.signal.aborted) { setDraft(draftOf(value)); setFailed(false); } }).catch((error: unknown) => {
            if (abort.signal.aborted) return;
            if (error instanceof ApiError && error.http === 401) onRevoked();
            else { setFailed(true); onFlash({ text: explain(error), tone: 'error' }); }
        });
        return () => abort.abort();
    }, [api, token, onRevoked, onFlash, attempt]);

    async function save(event: FormEvent) {
        event.preventDefault();
        if (!draft || busy) return;
        const number = (value: string, min: number) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= 2147483647;
        if (!number(draft.maxQueueSize, 1) || !number(draft.minimumVotes, 1) || !number(draft.dailyPlayNextLimit, 0)) {
            onFlash({ text: 'Enter whole numbers within the allowed range.', tone: 'error' }); return;
        }
        setBusy(true);
        try {
            const value = await api.updateSettings(token, { ...draft, maxQueueSize: Number(draft.maxQueueSize), minimumVotes: Number(draft.minimumVotes), dailyPlayNextLimit: Number(draft.dailyPlayNextLimit) });
            if (mounted.current) { setDraft(draftOf(value)); onFlash({ text: 'Room settings saved.', tone: 'success' }); }
        } catch (error) {
            if (mounted.current) {
                if (error instanceof ApiError && error.http === 401) onRevoked();
                else onFlash({ text: explain(error), tone: 'error' });
            }
        } finally { if (mounted.current) setBusy(false); }
    }

    return <details className="collapse collapse-arrow border border-base-300 bg-base-100">
        <summary className="collapse-title font-semibold">Room settings</summary>
        <div className="collapse-content">
            {failed && <button type="button" className="btn btn-sm" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Retry loading settings</button>}
            {!draft && !failed && <p role="status">Loading settings…</p>}
            {draft && <form className="space-y-4" onSubmit={(event) => void save(event)}>
                <fieldset disabled={busy} className="space-y-4">
                    <label className="block">Maximum queue size <input className="input w-full" type="number" min="1" max="2147483647" step="1" required value={draft.maxQueueSize} onChange={(event) => setDraft({ ...draft, maxQueueSize: event.target.value })} /></label>
                    <label className="block">Votes needed to skip <input className="input w-full" type="number" min="1" max="2147483647" step="1" required value={draft.minimumVotes} onChange={(event) => setDraft({ ...draft, minimumVotes: event.target.value })} /></label>
                    <label className="flex items-center gap-3"><input className="toggle" type="checkbox" checked={draft.playNextCommand} onChange={(event) => setDraft({ ...draft, playNextCommand: event.target.checked })} /> Allow Play Next</label>
                    <label className="block">Daily Play Next limit <input className="input w-full" type="number" min="0" max="2147483647" step="1" required disabled={!draft.playNextCommand} value={draft.dailyPlayNextLimit} onChange={(event) => setDraft({ ...draft, dailyPlayNextLimit: event.target.value })} /><span className="block text-sm text-base-content/75">Per guest; 0 means unlimited.</span></label>
                    <label className="flex items-center gap-3"><input className="toggle" type="checkbox" checked={draft.allowVideoSearch} onChange={(event) => setDraft({ ...draft, allowVideoSearch: event.target.checked })} /> Allow video search</label>
                    <button className="btn" type="submit">{busy ? 'Saving…' : 'Save changes'}</button>
                </fieldset>
            </form>}
        </div>
    </details>;
}
