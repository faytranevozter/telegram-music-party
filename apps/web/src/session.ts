export type StoredSession = { token: string; expiresAt: number; inviteKey: string | null; origin: string };
const key = 'ytparty-room-session';

export function readInvite(hash: string): string | null {
    return /^#([A-Za-z0-9_-]{32})$/.exec(hash)?.[1] ?? null;
}

export async function digestInvite(code: string): Promise<string> {
    const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
    return Array.from(new Uint8Array(data), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function readSession(storage: Pick<Storage, 'getItem'> | undefined, origin: string, now = Date.now()): StoredSession | null {
    try {
        const value = JSON.parse(storage?.getItem(key) ?? 'null') as Partial<StoredSession> | null;
        if (!value || value.origin !== origin || typeof value.token !== 'string' || !value.token ||
            typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt) || value.expiresAt <= now ||
            (value.inviteKey !== null && typeof value.inviteKey !== 'string')) return null;
        return value as StoredSession;
    } catch { return null; }
}

export function matchesInvite(session: StoredSession | null, inviteKey: string) { return session?.inviteKey === inviteKey; }

export function storageForTab() {
    try { return window.sessionStorage; } catch { return undefined; }
}

export function saveSession(storage: Storage | undefined, value: StoredSession) {
    try { storage?.setItem(key, JSON.stringify(value)); } catch { /* Current tab can still use its in-memory session. */ }
}

export function clearSession(storage: Storage | undefined, expectedToken: string) {
    try {
        const value = JSON.parse(storage?.getItem(key) ?? 'null') as Partial<StoredSession> | null;
        if (value?.token === expectedToken) storage?.removeItem(key);
    } catch { /* Storage is optional. */ }
}
