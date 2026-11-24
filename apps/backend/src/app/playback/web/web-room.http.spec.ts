import { Test } from '@nestjs/testing';
import { WebRoomController } from './web-room.controller';
import { WebRoomService } from './web-room.service';
import { WebRoomAccessService } from './web-room-access.service';
import { WebRateLimitService } from './web-rate-limit.service';
import { WebRoomStateService } from './web-room-state.service';
import { WebRoomSettingsService } from './web-room-settings.service';

it('joins through HTTP, rejects extra fields, and requires room authentication', async () => {
    const join = jest
        .fn()
        .mockResolvedValue({ token: 'test-session', room: { name: 'Party' } });
    const requireLimit = jest.fn().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
        controllers: [WebRoomController],
        providers: [
            { provide: WebRoomAccessService, useValue: { join } },
            {
                provide: WebRateLimitService,
                useValue: { require: requireLimit },
            },
            { provide: WebRoomService, useValue: {} },
            { provide: WebRoomStateService, useValue: {} },
            { provide: WebRoomSettingsService, useValue: {} },
        ],
    }).compile();
    const app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    try {
        const url = `${await app.getUrl()}/api/web/v1`;
        const post = (body: object) =>
            fetch(`${url}/rooms/join`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
        expect(
            (
                await post({
                    nickname: 'Guest',
                    shareCode: 'a'.repeat(32),
                    isAdmin: true,
                })
            ).status,
        ).toBe(400);
        expect(
            (await post({ nickname: ' Guest ', shareCode: 'a'.repeat(32) }))
                .status,
        ).toBe(201);
        expect(join).toHaveBeenCalledWith('a'.repeat(32), 'Guest');
        expect(requireLimit).toHaveBeenCalledWith('entry', '127.0.0.1', 10);
        expect((await fetch(`${url}/room`)).status).toBe(401);
    } finally {
        await app.close();
    }
});
