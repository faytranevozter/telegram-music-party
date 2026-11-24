import { Test } from '@nestjs/testing';
import { WebRoomController } from './web-room.controller';
import { WebRoomAccessService } from './web-room-access.service';
import { WebRateLimitService } from './web-rate-limit.service';
import { WebRoomService } from './web-room.service';
import { WebRoomStateService } from './web-room-state.service';
import { WebRoomSettingsService } from './web-room-settings.service';
import { PrismaService } from 'src/platform/prisma.service';
import { PlaybackGateway } from '../playback.gateway';

const initial = { maxQueueSize: 10, minimumVotes: 2, playNextCommand: true, dailyPlayNextLimit: 3, allowVideoSearch: false };

describe('web room settings', () => {
    const update = jest.fn();
    const findUnique = jest.fn();
    const changed = jest.fn();
    let service: WebRoomSettingsService;

    beforeEach(() => {
        jest.resetAllMocks();
        findUnique.mockResolvedValue(initial);
        update.mockImplementation(({ data }) => Promise.resolve({ ...initial, ...data }));
        service = new WebRoomSettingsService({ feature: { findUnique, update } } as any, { roomChanged: changed } as any);
    });

    it('reads and atomically updates selected settings', async () => {
        expect(await service.get('room')).toEqual(initial);
        expect(await service.update('room', { minimumVotes: 1, dailyPlayNextLimit: 0 })).toEqual({ ...initial, minimumVotes: 1, dailyPlayNextLimit: 0 });
        expect(update).toHaveBeenCalledTimes(1);
        expect(changed).toHaveBeenCalledWith('room');
    });

    it.each([{}, [], { roomId: 'other' }, { minimumVotes: 0 }, { maxQueueSize: -1 }, { dailyPlayNextLimit: -1 }, { minimumVotes: 1.5 }, { minimumVotes: 2147483648 }, { minimumVotes: '1' }, { allowVideoSearch: 1 }, { allowVideoSearch: true, maxQueueSize: 0 }])('rejects invalid input %p without writing', async (value) => {
        await expect(service.update('room', value)).rejects.toMatchObject({ status: 400 });
        expect(update).not.toHaveBeenCalled();
        expect(changed).not.toHaveBeenCalled();
    });

    it('does not notify after a database failure', async () => {
        update.mockRejectedValue(new Error('database failure'));
        await expect(service.update('room', { maxQueueSize: 5 })).rejects.toThrow('database failure');
        expect(changed).not.toHaveBeenCalled();
    });

    it('enforces session ownership over HTTP', async () => {
        const access = { authenticate: jest.fn(async (token: string) => {
            if (token === 'expired') throw new (require('@nestjs/common').UnauthorizedException)();
            return { room: { id: 'own-room' }, actor: { userRef: token, isAdmin: async () => token === 'owner' } };
        }) };
        const module = await Test.createTestingModule({ controllers: [WebRoomController], providers: [
            { provide: WebRoomAccessService, useValue: access },
            { provide: WebRateLimitService, useValue: { require: jest.fn() } },
            { provide: WebRoomService, useValue: {} },
            { provide: WebRoomStateService, useValue: {} },
            { provide: WebRoomSettingsService, useValue: service },
            { provide: PrismaService, useValue: {} },
            { provide: PlaybackGateway, useValue: {} },
        ] }).compile();
        const app = module.createNestApplication();
        await app.listen(0, '127.0.0.1');
        try {
            const url = `${await app.getUrl()}/api/web/v1/room/settings`;
            const request = (token?: string, body?: object) => fetch(url, { method: body ? 'POST' : 'GET', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
            expect((await request()).status).toBe(401);
            expect((await request('expired')).status).toBe(401);
            expect((await request('guest')).status).toBe(403);
            expect((await request('guest', { maxQueueSize: 3 })).status).toBe(403);
            expect(await (await request('owner')).json()).toEqual(initial);
            expect((await request('owner', { roomId: 'other', maxQueueSize: 3 })).status).toBe(400);
            expect((await request('owner', { maxQueueSize: 3 })).status).toBe(201);
            expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { roomId: 'own-room' } }));
        } finally { await app.close(); }
    });
});
