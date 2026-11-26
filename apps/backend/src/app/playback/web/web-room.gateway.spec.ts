import { WebRoomGateway } from './web-room.gateway';

describe('WebRoomGateway request refusals', () => {
    it('sends the notice only to the authenticated requester in that room', async () => {
        let refuse: (roomId: string, userRef: string, title: string) => void = () => undefined;
        const authenticate = jest.fn(async (token: string) => ({
            room: { id: token === 'other-room' ? 'other' : 'room' },
            actor: { userRef: token === 'other-guest' ? 'guest-2' : 'guest-1' },
            expiresAt: Date.now() + 60_000,
        }));
        const gateway = new WebRoomGateway(
            { authenticate, watchInvites: () => () => undefined } as never,
            { snapshot: async () => ({}) } as never,
            {
                watchRoomChanges: () => () => undefined,
                watchQueueRefusals: (listener: typeof refuse) => { refuse = listener; return () => undefined; },
            } as never,
        );
        gateway.afterInit({ use: jest.fn() } as never);
        const socket = (token: string) => ({ handshake: { auth: { token } }, connected: true, emit: jest.fn(), disconnect: jest.fn() });
        const requester = socket('requester');
        const otherGuest = socket('other-guest');
        const otherRoom = socket('other-room');
        try {
            await Promise.all([requester, otherGuest, otherRoom].map((client) => gateway.handleConnection(client as never)));
            refuse('room', 'guest-1', 'Good Life');
            await new Promise<void>((resolve) => setImmediate(resolve));
            expect(requester.emit).toHaveBeenCalledWith('room:request-unavailable', { title: 'Good Life' });
            for (const other of [otherGuest, otherRoom]) {
                expect(other.emit.mock.calls.map(([event]) => event)).not.toContain('room:request-unavailable');
            }
        } finally {
            gateway.onModuleDestroy();
        }
    });
});
