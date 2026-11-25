import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError, explain, type RequesterDisplay, type RoomSettings as Settings, type WebApi } from './api';
import type { FlashMessage } from './RoomChrome';

type NumericField = 'maxQueueSize' | 'minimumVotes' | 'dailyPlayNextLimit' | 'guestRequestLimit' | 'guestRequestPeriodMinutes';
type Draft = Omit<Settings, NumericField> & Record<NumericField, string>;
const draftOf = (value: Settings): Draft => ({ ...value, maxQueueSize: String(value.maxQueueSize), minimumVotes: String(value.minimumVotes), dailyPlayNextLimit: String(value.dailyPlayNextLimit), guestRequestLimit: String(value.guestRequestLimit ?? 0), guestRequestPeriodMinutes: String(value.guestRequestPeriodMinutes ?? 10) });

function NumberSetting({ label, value, onChange, min, max, disabled, help }: {
    label: string; value: string; onChange: (value: string) => void;
    min: number; max: number; disabled?: boolean; help?: string;
}) {
    const id = useId();
    return <fieldset className="fieldset py-0">
        <label className="label" htmlFor={id}>{label}</label>
        <input id={id} className="input w-full" type="number" min={min} max={max} step="1" required disabled={disabled} aria-describedby={help ? `${id}-help` : undefined} value={value} onChange={(event) => onChange(event.target.value)} />
        {help && <p id={`${id}-help`} className="label whitespace-normal">{help}</p>}
    </fieldset>;
}

export function RoomSettings({ api, token, onRevoked, onFlash }: { api: Pick<WebApi, 'settings' | 'updateSettings'>; token: string; onRevoked: () => void; onFlash: (message: FlashMessage) => void }) {
    const requesterDisplayId = useId();
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
        const number = (value: string, min: number, max = 2147483647) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
        if (!number(draft.maxQueueSize, 1) || !number(draft.minimumVotes, 1) || !number(draft.dailyPlayNextLimit, 0) || !number(draft.guestRequestLimit, 0, 100) || !number(draft.guestRequestPeriodMinutes, 1, 1440)) {
            onFlash({ text: 'Enter whole numbers within the allowed range.', tone: 'error' }); return;
        }
        setBusy(true);
        try {
            const value = await api.updateSettings(token, { ...draft, maxQueueSize: Number(draft.maxQueueSize), minimumVotes: Number(draft.minimumVotes), dailyPlayNextLimit: Number(draft.dailyPlayNextLimit), guestRequestLimit: Number(draft.guestRequestLimit), guestRequestPeriodMinutes: Number(draft.guestRequestPeriodMinutes) });
            if (mounted.current) { setDraft(draftOf(value)); onFlash({ text: 'Room settings saved.', tone: 'success' }); }
        } catch (error) {
            if (mounted.current) {
                if (error instanceof ApiError && error.http === 401) onRevoked();
                else onFlash({ text: explain(error), tone: 'error' });
            }
        } finally { if (mounted.current) setBusy(false); }
    }

    return <section aria-label="Room settings" className="space-y-4">
        <h2 className="font-semibold">Room settings</h2>
            {failed && <button type="button" className="btn btn-sm" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Retry loading settings</button>}
            {!draft && !failed && <p role="status">Loading settings…</p>}
            {draft && <form className="space-y-4" onSubmit={(event) => void save(event)}>
                <fieldset disabled={busy} className="space-y-4">
                    <NumberSetting label="Maximum queue size" min={1} max={2147483647} value={draft.maxQueueSize} onChange={(maxQueueSize) => setDraft({ ...draft, maxQueueSize })} />
                    <NumberSetting label="Votes needed to skip" min={1} max={2147483647} value={draft.minimumVotes} onChange={(minimumVotes) => setDraft({ ...draft, minimumVotes })} />
                    <label className="flex items-center gap-3"><input className="toggle" type="checkbox" checked={draft.playNextCommand} onChange={(event) => setDraft({ ...draft, playNextCommand: event.target.checked })} /> Allow Play Next</label>
                    <NumberSetting label="Daily Play Next limit" min={0} max={2147483647} disabled={!draft.playNextCommand} value={draft.dailyPlayNextLimit} onChange={(dailyPlayNextLimit) => setDraft({ ...draft, dailyPlayNextLimit })} help="Per guest; 0 means unlimited." />
                    <label className="flex items-center gap-3"><input className="toggle" type="checkbox" checked={draft.allowVideoSearch} onChange={(event) => setDraft({ ...draft, allowVideoSearch: event.target.checked })} /> Allow video search</label>
                    <NumberSetting label="Tracks per guest" min={0} max={100} value={draft.guestRequestLimit} onChange={(guestRequestLimit) => setDraft({ ...draft, guestRequestLimit })} help="Queue and Play Next combined. 0 means unlimited." />
                    <NumberSetting label="Limit period (minutes)" min={1} max={1440} value={draft.guestRequestPeriodMinutes} onChange={(guestRequestPeriodMinutes) => setDraft({ ...draft, guestRequestPeriodMinutes })} />
                    <fieldset className="fieldset py-0">
                        <label className="label" htmlFor={requesterDisplayId}>Requester display</label>
                        <select id={requesterDisplayId} className="select w-full" aria-describedby={`${requesterDisplayId}-help`} value={draft.requesterDisplay ?? 'hidden'} onChange={(event) => setDraft({ ...draft, requesterDisplay: event.target.value as RequesterDisplay })}>
                            <option value="hidden">Hidden</option>
                            <option value="anonymous">Anonymous</option>
                            <option value="name">Show names</option>
                        </select>
                        <p id={`${requesterDisplayId}-help`} className="label whitespace-normal">Changing this applies to tracks still in the queue. Show names uses the display name saved when each track was requested.</p>
                    </fieldset>
                    <button className="btn" type="submit">{busy ? 'Saving…' : 'Save changes'}</button>
                </fieldset>
            </form>}
    </section>;
}
