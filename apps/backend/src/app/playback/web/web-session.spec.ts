import { WebSession } from './web-session';

describe('WebSession', () => {
    const session = new WebSession(Buffer.alloc(32, 7));
    const claims = {
        roomId: 'room',
        userRef: 'web:4aeb8403-5a68-4182-9eb8-ccfb02ee1c67',
        nickname: 'Guest',
        inviteVersion: 'a'.repeat(64),
        exp: Date.now() + 60_000,
    };

    it('round-trips valid claims', () => {
        expect(session.verify(session.sign(claims))).toEqual(claims);
    });

    it('rejects a changed signature, expired claims, and invalid input', () => {
        const token = session.sign(claims);
        const [body, signature] = token.split('.');
        const changed = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
        expect(session.verify(`${body}.${changed}`)).toBeNull();
        expect(session.verify(session.sign({ ...claims, exp: 1 }))).toBeNull();
        expect(session.verify('not-a-token')).toBeNull();
        expect(session.verify('a'.repeat(4097))).toBeNull();
        const elevated = { ...claims, isAdmin: true };
        expect(session.verify(session.sign(elevated))).toBeNull();
    });
});
