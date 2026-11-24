import { createHmac, timingSafeEqual } from 'node:crypto';

export type WebSessionClaims = {
    roomId: string;
    userRef: string;
    nickname: string;
    inviteVersion: string | null;
    exp: number;
};

const base64url = /^[A-Za-z0-9_-]+$/;

function validClaims(value: unknown): value is WebSessionClaims {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const { roomId, userRef, nickname, inviteVersion, exp } = value as Record<
        string,
        unknown
    >;
    return (
        Object.keys(value).length === 5 &&
        typeof roomId === 'string' &&
        /^[A-Za-z0-9_-]{1,128}$/.test(roomId) &&
        typeof userRef === 'string' &&
        /^web:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(userRef) &&
        typeof nickname === 'string' &&
        nickname === nickname.trim() &&
        [...nickname].length >= 1 &&
        [...nickname].length <= 32 &&
        !/\p{Cc}/u.test(nickname) &&
        (inviteVersion === null ||
            (typeof inviteVersion === 'string' &&
                /^[a-f0-9]{64}$/.test(inviteVersion))) &&
        typeof exp === 'number' &&
        Number.isSafeInteger(exp) &&
        exp > Date.now()
    );
}

export class WebSession {
    constructor(private readonly secret: Buffer) {
        if (secret.length < 32)
            throw new Error(
                'Web session secret must contain at least 32 bytes',
            );
    }

    sign(claims: WebSessionClaims): string {
        const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
        return `${body}.${this.mac(body).toString('base64url')}`;
    }

    verify(token: string): WebSessionClaims | null {
        if (!token || token.length > 4096) return null;
        const parts = token.split('.');
        if (parts.length !== 2 || !parts.every((part) => base64url.test(part)))
            return null;
        const [body, signature] = parts;
        const supplied = Buffer.from(signature, 'base64url');
        const expected = this.mac(body);
        if (
            supplied.length !== expected.length ||
            supplied.toString('base64url') !== signature ||
            !timingSafeEqual(supplied, expected)
        )
            return null;
        try {
            const claims: unknown = JSON.parse(
                Buffer.from(body, 'base64url').toString('utf8'),
            );
            return validClaims(claims) ? claims : null;
        } catch {
            return null;
        }
    }

    private mac(body: string): Buffer {
        return createHmac('sha256', this.secret).update(body).digest();
    }
}
