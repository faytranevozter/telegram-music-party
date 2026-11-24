import { useEffect, type ReactNode } from 'react';

export type FlashMessage = { text: string; tone: 'success' | 'error' | 'info' };

export function RoomHeader({ name, role, connection, children }: {
    name: string;
    role?: string;
    connection?: { label: string; online: boolean };
    children?: ReactNode;
}) {
    return <header className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-4">
        <div className="min-w-0">
            <h1>{name}</h1>
            {(role || connection) && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {role && <span className="badge badge-outline badge-sm">{role}</span>}
                {connection && <span className="inline-flex items-center gap-2 text-base-content/75" role="status">
                    <span className={`status status-sm ${connection.online ? 'status-success' : 'status-warning'}`} aria-hidden="true" />{connection.label}
                </span>}
            </div>}
        </div>
        {children}
    </header>;
}

export function RoomFlash({ message, onDismiss }: { message: FlashMessage | null; onDismiss: () => void }) {
    useEffect(() => {
        if (!message || message.tone === 'error') return;
        const timer = window.setTimeout(onDismiss, 5000);
        return () => window.clearTimeout(timer);
    }, [message, onDismiss]);

    const tone = message?.tone;
    return <div className="toast toast-bottom toast-end z-40 w-[min(24rem,calc(100%-1rem))] max-w-full p-2">
        {message && <div className={`alert alert-soft flex items-center gap-3 shadow-md ${tone === 'error' ? 'alert-error' : tone === 'success' ? 'alert-success' : 'alert-info'}`}>
            <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d={tone === 'success' ? 'm5 12 4 4L19 6' : tone === 'error' ? 'M12 8v5m0 3h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z' : 'M12 11v5m0-8h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z'} />
            </svg>
            <span className="min-w-0 flex-1 break-words" role={tone === 'error' ? 'alert' : 'status'}>{message.text}</span>
            <button type="button" className="btn btn-ghost btn-square btn-sm" aria-label="Dismiss message" onClick={onDismiss}>
                <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
        </div>}
    </div>;
}
