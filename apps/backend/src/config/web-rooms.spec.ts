import { webRoomsConfig } from './web-rooms';

const secret = Buffer.alloc(32, 11).toString('base64url');

it('defaults to disabled without requiring any setup', () => {
    expect(webRoomsConfig({})).toEqual({ enabled: false });
});

it('rejects an enabled deployment without a valid secret or exact origin', () => {
    expect(() => webRoomsConfig({ WEB_ROOMS_ENABLED: 'true' })).toThrow(
        'WEB_SESSION_SECRET',
    );
    expect(() =>
        webRoomsConfig({
            WEB_ROOMS_ENABLED: 'true',
            WEB_SESSION_SECRET: secret,
            WEB_PUBLIC_ORIGIN: 'https://party.example/room',
        }),
    ).toThrow('WEB_PUBLIC_ORIGIN');
});

it('accepts a loopback origin for development', () => {
    expect(
        webRoomsConfig({
            WEB_ROOMS_ENABLED: 'true',
            WEB_SESSION_SECRET: secret,
            WEB_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
        }),
    ).toMatchObject({ enabled: true, origin: 'http://127.0.0.1:5173' });
});
