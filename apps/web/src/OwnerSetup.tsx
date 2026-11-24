import { useEffect, useState } from 'react';
import { ApiError, explain, type Setup, type WebApi } from './api';
import { readInvite } from './session';

export function OwnerSetup({ api, token, onRevoked }: { api: WebApi; token: string; onRevoked: () => void }) {
    const [setup, setSetup] = useState<Setup>();
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<'rotate' | 'disable'>();
    useEffect(() => {
        const abort = new AbortController();
        void api.setup(token, abort.signal).then((value) => { if (!abort.signal.aborted) setSetup(value); }).catch((cause: unknown) => {
            if (abort.signal.aborted) return;
            if (cause instanceof ApiError && cause.http === 401) onRevoked();
            else setNotice(explain(cause));
        });
        return () => abort.abort();
    }, [api, token, onRevoked]);
    const link = setup?.shareCode ? `${location.origin}/room#${setup.shareCode}` : null;
    async function copy(value: string, label: string) {
        try { await navigator.clipboard.writeText(value); setNotice(`${label} copied.`); }
        catch { setNotice(`Could not copy ${label.toLowerCase()}. Select the text and copy it manually.`); }
    }
    async function change(mode: 'enable' | 'rotate' | 'disable') {
        setBusy(true); setConfirm(undefined);
        try {
            const { url } = await api.invite(token, mode);
            setSetup((current) => current && { ...current, shareCode: url ? readInvite(new URL(url).hash) : null });
            setNotice(mode === 'disable' ? 'Invite disabled.' : 'Invite ready to share.');
        } catch (cause) {
            if (cause instanceof ApiError && cause.http === 401) onRevoked();
            else setNotice(explain(cause));
        } finally { setBusy(false); }
    }
    return <details className="owner"><summary>Player setup and invites</summary>
        <p>Open the extension on YouTube Music. Enter the room ID and use <code>{api.origin}</code> as the party server.</p>
        {setup ? <>
            <label>Player room ID<input readOnly value={setup.roomId} /></label><button onClick={() => void copy(setup.roomId, 'Room ID')}>Copy room ID</button>
            {link && <><label>Guest invite<input readOnly value={link} /></label><button onClick={() => void copy(link, 'Invite')}>Copy invite</button></>}
            <div className="actions">{link ? <><button disabled={busy} onClick={() => setConfirm('rotate')}>Rotate invite</button><button disabled={busy} onClick={() => setConfirm('disable')}>Disable invite</button></> : <button disabled={busy} onClick={() => void change('enable')}>Enable invite</button>}</div>
            {confirm && <div className="notice"><p>This ends all current guest sessions. Continue?</p><div className="actions"><button onClick={() => void change(confirm)}>Confirm {confirm === 'rotate' ? 'rotation' : 'disable'}</button><button onClick={() => setConfirm(undefined)}>Cancel</button></div></div>}
        </> : !notice && <p>Loading setup…</p>}
        <p role="status">{notice}</p>
    </details>;
}
