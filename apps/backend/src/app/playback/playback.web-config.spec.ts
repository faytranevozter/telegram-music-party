/* Partial Telegram callback contexts. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { ENV } from 'src/config/env';
import { buildController, groupContext } from './testing/controller-harness';
import { WebRoomAccessService } from './web/web-room-access.service';

afterEach(() => jest.restoreAllMocks());

it('leaves invites unavailable when web rooms are disabled', async () => {
    jest.replaceProperty(ENV, 'WEB_ROOMS', { enabled: false });
    const setInvite = jest.fn();
    const { controller } = buildController({
        webAccess: { setInvite } as unknown as WebRoomAccessService,
    });
    const { ctx } = groupContext({ chatType: 'private' });
    ctx.match = ['', 'web:enable'];
    ctx.callbackQuery = { message: { chat: { id: 7 } } };
    await controller.updateConfig(ctx);
    expect(setInvite).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Web invites unavailable');
});

it('never falls back to posting an invite in the group if the DM fails', async () => {
    jest.replaceProperty(ENV, 'WEB_ROOMS', {
        enabled: true,
        origin: 'https://party.example',
        secret: Buffer.alloc(32),
    });
    const setInvite = jest.fn().mockResolvedValue('test-code');
    const { controller } = buildController({
        webAccess: { setInvite } as unknown as WebRoomAccessService,
    });
    const { ctx } = groupContext({ status: 'administrator' });
    ctx.match = ['', 'web:enable'];
    ctx.callbackQuery = { message: { chat: { id: -100 } } };
    ctx.telegram.sendMessage = jest.fn().mockRejectedValue(new Error('No DM'));
    ctx.editMessageText = jest.fn();
    await controller.updateConfig(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(
        'Start the bot privately, then tap Send web invite.',
    );
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(JSON.stringify(ctx.editMessageText.mock.calls)).not.toContain(
        'test-code',
    );
});

it.each(['enable', 'rotate', 'disable'] as const)(
    'lets a topic admin %s the invite without posting the secret to the topic',
    async (mode) => {
        const setInvite = jest
            .fn()
            .mockResolvedValue(mode === 'disable' ? null : 'test-code');
        const { controller, playback } = buildController({
            webAccess: { setInvite } as unknown as WebRoomAccessService,
        });
        jest.replaceProperty(ENV, 'WEB_ROOMS', {
            enabled: true,
            origin: 'https://party.example',
            secret: Buffer.alloc(32),
        });
        const { ctx } = groupContext({ status: 'administrator' });
        ctx.match = ['', `web:${mode}`];
        ctx.editMessageText = jest.fn();
        ctx.callbackQuery = {
            message: { chat: { id: -100 }, message_thread_id: 42 },
        };
        const sendMessage = jest.fn().mockResolvedValue(undefined);
        ctx.telegram.sendMessage = sendMessage;
        await controller.updateConfig(ctx);
        expect(playback.getRoomByChatId).toHaveBeenCalledWith('-100', 42);
        expect(setInvite).toHaveBeenCalledWith('room', mode);
        if (mode === 'disable') expect(sendMessage).not.toHaveBeenCalled();
        else
            expect(sendMessage).toHaveBeenCalledWith(
                7,
                expect.stringContaining('https://party.example/room#test-code'),
                expect.any(Object),
            );
        expect(ctx.reply).not.toHaveBeenCalled();
    },
);

it('denies invite management to a regular group member', async () => {
    const setInvite = jest.fn();
    const { controller } = buildController({
        webAccess: { setInvite } as unknown as WebRoomAccessService,
    });
    const { ctx } = groupContext();
    ctx.match = ['', 'web:enable'];
    ctx.callbackQuery = { message: { chat: { id: -100 } } };
    await controller.updateConfig(ctx);
    expect(setInvite).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Admin only');
});
