export type WebRoomsConfig =
    | { enabled: false }
    | { enabled: true; origin: string; secret: Buffer };

export function webRoomsConfig(env: NodeJS.ProcessEnv): WebRoomsConfig {
    if (env.WEB_ROOMS_ENABLED !== 'true') return { enabled: false };
    const encoded = env.WEB_SESSION_SECRET ?? '';
    const secret = Buffer.from(encoded, 'base64url');
    if (secret.length < 32 || secret.toString('base64url') !== encoded) {
        throw new Error(
            'WEB_SESSION_SECRET must be at least 32 random bytes encoded as base64url',
        );
    }
    const origin = env.WEB_PUBLIC_ORIGIN ?? '';
    const parsed = URL.canParse(origin) ? new URL(origin) : null;
    const loopback =
        parsed && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (
        !parsed ||
        parsed.origin !== origin ||
        !(
            parsed.protocol === 'https:' ||
            (parsed.protocol === 'http:' && loopback)
        )
    ) {
        throw new Error(
            'WEB_PUBLIC_ORIGIN must be one exact HTTPS origin (HTTP is allowed for loopback)',
        );
    }
    return { enabled: true, origin, secret };
}
