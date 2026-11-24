import { useEffect, useState } from 'react';
import { ApiError, explain, type Setup, type WebApi } from './api';
import { readInvite } from './session';
import type { FlashMessage } from './RoomChrome';

export function OwnerSetup({ api, token, onRevoked, onFlash }: { api: Pick<WebApi, 'setup' | 'invite' | 'origin'>; token: string; onRevoked: () => void; onFlash: (message: FlashMessage) => void }) {
    const [setup, setSetup] = useState<Setup>();
    const [loadFailed, setLoadFailed] = useState(false);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<'rotate' | 'disable'>();
    useEffect(() => {
        const abort = new AbortController();
        void api.setup(token, abort.signal).then((value) => { if (!abort.signal.aborted) setSetup(value); }).catch((cause: unknown) => {
            if (abort.signal.aborted) return;
            if (cause instanceof ApiError && cause.http === 401) onRevoked();
            else { setLoadFailed(true); onFlash({ text: explain(cause), tone: 'error' }); }
        });
        return () => abort.abort();
    }, [api, token, onRevoked, onFlash, loadAttempt]);
    const link = setup?.shareCode ? `${location.origin}/#${setup.shareCode}` : null;
    async function copy(value: string, label: string) {
        try { await navigator.clipboard.writeText(value); onFlash({ text: `${label} copied.`, tone: 'success' }); }
        catch { onFlash({ text: `Could not copy ${label.toLowerCase()}. Select the text and copy it manually.`, tone: 'error' }); }
    }
    async function change(mode: 'enable' | 'rotate' | 'disable') {
        setBusy(true); setConfirm(undefined);
        try {
            const { url } = await api.invite(token, mode);
            setSetup((current) => current && { ...current, shareCode: url ? readInvite(new URL(url).hash) : null });
            onFlash({ text: mode === 'disable' ? 'Invites turned off.' : mode === 'rotate' ? 'Invite link replaced.' : 'Invite link ready to share.', tone: 'success' });
        } catch (cause) {
            if (cause instanceof ApiError && cause.http === 401) onRevoked();
            else onFlash({ text: explain(cause), tone: 'error' });
        } finally { setBusy(false); }
    }
    return <details className="collapse collapse-arrow border border-base-300 bg-base-100">
        <summary className="collapse-title flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-semibold">Room info &amp; invites</span>{setup && <span className={`badge badge-sm ${link ? 'badge-success badge-soft' : 'badge-outline'}`}>{link ? 'Invite active' : 'Invites off'}</span>}</summary>
        <div className="collapse-content space-y-4">
        {setup ? <>
            <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <section className="min-w-0 space-y-3 rounded-box bg-base-200 p-4" aria-label="Guest access">
                    <h2 className="text-base">Guest access</h2>
                    <p className="text-sm text-base-content/75">{link ? 'Anyone with this link can join the queue without Telegram.' : 'Enable an invite when you’re ready to let guests join.'}</p>
                    {link && <label>Guest invite link<span className="join flex w-full"><input className="input join-item min-w-0 flex-1" readOnly value={link} /><button type="button" className="btn btn-primary join-item shrink-0" aria-label="Copy invite link" onClick={() => void copy(link, 'Invite link')}>Copy</button></span></label>}
                    <div className="actions">{link ? <><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirm('rotate')}>Replace link</button><button type="button" className="btn btn-error btn-ghost btn-sm" disabled={busy} onClick={() => setConfirm('disable')}>Turn off invites</button></> : <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void change('enable')}>Enable invite</button>}</div>
                </section>
                <section className="min-w-0 space-y-3 rounded-box border border-base-300 p-4" aria-label="Player setup">
                    <h2 className="text-base">Player setup</h2>
                    <p className="text-sm text-base-content/75">Enter this room ID in the Music Party extension on YouTube Music.</p>
                    <label>Room ID<span className="join flex w-full"><input className="input join-item min-w-0 flex-1" readOnly value={setup.roomId} /><button type="button" className="btn join-item shrink-0" aria-label="Copy room ID" onClick={() => void copy(setup.roomId, 'Room ID')}>Copy</button></span></label>
                    <p className="break-all text-sm text-base-content/75">Party server: <code>{api.origin}</code></p>
                </section>
            </div>
            {confirm && <div className="alert alert-warning alert-soft flex flex-wrap justify-between gap-3"><p>The current link will stop working and connected guests will be signed out.</p><div className="actions"><button type="button" className="btn btn-sm" disabled={busy} onClick={() => void change(confirm)}>{confirm === 'rotate' ? 'Replace invite link' : 'Turn off invites'}</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(undefined)}>Cancel</button></div></div>}
        </> : loadFailed ? <button type="button" className="btn btn-sm" onClick={() => { setLoadFailed(false); setLoadAttempt((attempt) => attempt + 1); }}>Retry loading room info</button> : <p>Loading setup…</p>}
    </div></details>;
}
