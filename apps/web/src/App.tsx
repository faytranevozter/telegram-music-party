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
            saveSession(storage, next);
            setSaved(next);
            setActive({ session: next, hash });
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
        <header className="navbar min-h-0 flex-wrap gap-2 border-b border-base-300 px-0 py-3">
            <a href="/" className="flex flex-1 items-center gap-2 font-bold"><img src="/music-party-mark.jpg" alt="" width="32" height="32" className="rounded-lg" /> Music Party</a>
            <button type="button" className="btn btn-ghost min-h-11 min-w-24" data-appearance-swap />
            <a href="https://ytparty.my.id/support" className="btn btn-ghost btn-sm">Help</a>
        </header>
        <main>
            {api && session ? <Room key={session.token} api={api} token={session.token} onLeave={() => close(session.token)} onRevoked={() => close(session.token, true)} /> :
                <div className={`room-entry${hash ? ' room-entry-invite' : ''}`}>
                    {!hash && <section className="room-entry-intro" aria-labelledby="room-entry-title">
                        <div className="room-entry-record" aria-hidden="true"><span>♫</span></div>
                        <h1 id="room-entry-title">One player.<br />Everyone picks the music.</h1>
                        <p>Start a room, share the invite, and build the queue together. The host plays it on YouTube Music.</p>
                        <ol className="room-entry-steps">
                            <li><span aria-hidden="true">01</span> Create a room</li>
                            <li><span aria-hidden="true">02</span> Connect the host’s player</li>
                            <li><span aria-hidden="true">03</span> Share the guest invite</li>
                        </ol>
                    </section>}
                    <section className="card border border-base-300 bg-base-100" aria-labelledby="entry-form-title"><div className="card-body gap-4">
                        {hash ? <h1 id="entry-form-title">{invite ? 'Join the room' : 'Invite unavailable'}</h1> : <h2 id="entry-form-title">Start a room</h2>}
                        <p className="text-base-content/75">{invite ? 'Pick a nickname to join the shared queue. No Telegram account needed.' : hash ? 'You’ll need a current invite from the host.' : 'Give your room a name and choose how friends will see you.'}</p>
                        {!api ? <p role="alert">This build doesn’t have a party server configured.</p> : <>
                            {!hash && saved && saved.expiresAt > Date.now() && <button type="button" className="btn btn-outline" onClick={() => setActive({ session: saved, hash })}>Resume room</button>}
                            {hash && !invite ? <p role="alert">This invite link is invalid. Ask the host for a new one.</p> :
                                <form onSubmit={enter}>
                                    {!invite && <label>Room name<input className="input input-bordered w-full" id="room-name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>}
                                    <label>Nickname<input className="input input-bordered w-full" id="nickname" required maxLength={64} value={nickname} onChange={(event) => setNickname(event.target.value)} /></label>
                                    <button className="btn btn-primary mt-1" disabled={busy || !nickname.trim() || [...nickname.trim()].length > 32 || (!invite && !name.trim())}>{busy ? 'Opening room…' : invite ? 'Join room' : 'Create room'}</button>
                                    {!invite && <small className="text-base-content/70">Keep this tab open to retain owner access. Leaving the room clears it.</small>}
                                </form>}
                        </>}
                        {error && <p role="alert" className="alert alert-warning">{error}</p>}
                    </div></section>
                </div>}
        </main>
        <footer><a className="link link-hover" href="https://ytparty.my.id/privacy">Privacy</a><a className="link link-hover" href="https://ytparty.my.id/terms">Terms</a></footer>
    </div>;
}
