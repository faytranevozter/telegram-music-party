import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createWebApi, explain, ApiError } from './api';
import { clearSession, digestInvite, matchesInvite, readInvite, readSession, saveSession, storageForTab, type StoredSession } from './session';
import { Room } from './Room';

export function App({ origin }: { origin?: string }) {
    const api = useMemo(() => {
        try {
            const url = new URL(origin ?? '');
            return url.origin === origin && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) ? createWebApi(origin) : null;
        } catch { return null; }
    }, [origin]);
    const storage = useMemo(storageForTab, []);
    const [hash, setHash] = useState(location.hash);
    const [active, setActive] = useState<{ session: StoredSession; hash: string } | null>(null);
    const [saved, setSaved] = useState(() => api ? readSession(storage, api.origin) : null);
    const [nickname, setNickname] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const generation = useRef(0);
    const invite = readInvite(hash);
    const session = active?.hash === hash ? active.session : null;

    useEffect(() => {
        const changed = () => {
            generation.current++;
            setHash(location.hash);
            setError('');
            setBusy(false);
            setActive(null);
        };
        window.addEventListener('hashchange', changed);
        return () => window.removeEventListener('hashchange', changed);
    }, []);

    useEffect(() => {
        if (!invite || !saved || session || !api) return;
        let current = true;
        void digestInvite(invite).then((key) => {
            if (current && location.hash === hash && saved.origin === api.origin && saved.expiresAt > Date.now() && matchesInvite(saved, key)) setActive({ session: saved, hash });
        }).catch(() => undefined);
        return () => { current = false; };
    }, [api, hash, invite, saved, session]);

    async function enter(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!api || busy) return;
        const attempt = ++generation.current;
        setBusy(true);
        setError('');
        try {
            const joined = invite ? await api.join(invite, nickname.trim()) : await api.create(name.trim(), nickname.trim());
            const inviteKey = invite ? await digestInvite(invite).catch(() => null) : null;
            if (attempt !== generation.current || location.hash !== hash) return;
            const next = { token: joined.token, expiresAt: joined.expiresAt, inviteKey, origin: api.origin };
            history.replaceState(null, '', location.pathname + location.search);
            saveSession(storage, next);
            setSaved(next);
            setHash('');
            setActive({ session: next, hash: '' });
        } catch (cause) {
            if (attempt === generation.current) setError(explain(cause, cause instanceof ApiError && cause.http === 404 && invite ? 'This invite is unavailable. Ask the host for a new link.' : 'Could not open the room. Check the form and try again.'));
        } finally { if (attempt === generation.current) setBusy(false); }
    }

    function close(token: string, revoked = false) {
        clearSession(storage, token);
        setSaved((value) => value?.token === token ? null : value);
        setActive((value) => value?.session.token === token ? null : value);
        if (revoked) setError('Your room session ended. Ask the host for a current invite.');
    }

    return <div className="frame">
        <header className="mast"><a href="/" className="brand"><span aria-hidden="true">◉</span> Music Party</a><a href="/support" className="underline">Help</a></header>
        <main>
            {api && session ? <Room key={session.token} api={api} token={session.token} onLeave={() => close(session.token)} onRevoked={() => close(session.token, true)} /> :
                <div className="entry">
                    <div className="sleeve" aria-hidden="true"><div className="record"><i /><i /><i /></div><span>Music<br />Party</span></div>
                    <section className="entry-form">
                        <h1>{invite ? 'Join the room' : 'Start a room'}</h1>
                        <p>{invite ? 'Pick a nickname and add a song to the shared queue. No Telegram account needed.' : 'Create a shared queue for your friends. One person connects the YouTube Music extension to play it.'}</p>
                        {!api ? <p role="alert">This build doesn’t have a party server configured.</p> : <>
                            {!hash && saved && saved.expiresAt > Date.now() && <button type="button" className="secondary" onClick={() => setActive({ session: saved, hash })}>Resume room</button>}
                            {hash && !invite ? <p role="alert">This invite link is invalid. Ask the host for a new one.</p> :
                                <form onSubmit={enter}>
                                    {!invite && <label>Room name<input id="room-name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>}
                                    <label>Nickname<input id="nickname" required maxLength={64} value={nickname} onChange={(event) => setNickname(event.target.value)} /></label>
                                    {!invite && <small>Keep this tab open to retain owner access. Leaving the room clears it.</small>}
                                    <button className="primary" disabled={busy || !nickname.trim() || [...nickname.trim()].length > 32 || (!invite && !name.trim())}>{busy ? 'Opening room…' : invite ? 'Join room' : 'Create room'}</button>
                                </form>}
                        </>}
                        {error && <p role="alert" className="notice">{error}</p>}
                    </section>
                </div>}
        </main>
        <footer><a href="/privacy">Privacy</a><a href="/terms">Terms</a></footer>
    </div>;
}
