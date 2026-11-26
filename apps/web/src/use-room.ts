import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ApiError, explain, type RoomState, type WebApi } from './api';
import { readOrder } from './room-order';

export function useRoom(api: WebApi, token: string, onRevoked: () => void) {
    const [state, setState] = useState<RoomState>();
    const [live, setLive] = useState(false);
    const [error, setError] = useState('');
    const [refusedRequest, setRefusedRequest] = useState<{ title: string } | null>(null);
    const handler = useRef(onRevoked);
    const reload = useRef<() => void>(() => undefined);
    useEffect(() => { handler.current = onRevoked; }, [onRevoked]);
    useEffect(() => {
        let open = true;
        let pending: AbortController | undefined;
        const order = readOrder();
        const socket = io(`${api.origin}/web-room`, { autoConnect: false, auth: { token }, transports: ['websocket'] });
        const load = async () => {
            pending?.abort();
            pending = new AbortController();
            const current = order.begin();
            try {
                const result = await api.state(token, pending.signal);
                if (open && current()) { setState(result); setError(''); }
            } catch (cause) {
                if (!open || !current()) return;
                if (cause instanceof ApiError && cause.http === 401) handler.current();
                else setError(explain(cause));
            }
        };
        reload.current = () => { if (!socket.connected) socket.connect(); void load(); };
        socket.on('room:state', (result: RoomState) => {
            if (!open) return;
            order.invalidate();
            pending?.abort();
            setState(result); setLive(true); setError('');
        });
        socket.on('room:request-unavailable', (result: { title: string }) => {
            if (open && typeof result?.title === 'string' && result.title.trim()) {
                setRefusedRequest({ title: result.title });
            }
        });
        const interrupted = () => { if (open) { setLive(false); void load(); } };
        socket.on('disconnect', interrupted);
        socket.on('connect_error', interrupted);
        reload.current();
        return () => { open = false; pending?.abort(); socket.removeAllListeners(); socket.disconnect(); };
    }, [api, token]);
    const refresh = useCallback(() => reload.current(), []);
    const dismissRefusedRequest = useCallback(() => setRefusedRequest(null), []);
    return { state, live, error, refresh, refusedRequest, dismissRefusedRequest };
}
