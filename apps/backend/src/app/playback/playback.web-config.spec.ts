/* Partial Telegram callback contexts. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { ENV } from 'src/config/env';
import { buildController, groupContext } from './testing/controller-harness';
import { WebRoomAccessService } from './web/web-room-access.service';

afterEach(() => jest.restoreAllMocks());

it.each([
    ['name', 'Requested by Alex &lt;3 &amp; friends'],
    ['anonymous', 'Requested by Anonymous'],
    ['hidden', undefined],
] as const)('renders Telegram /queue requester labels in %s mode', async (requesterDisplay, label) => {
    const { controller, playback } = buildController({ gateway: {
        getPlayerQueue: jest.fn().mockResolvedValue({ status: 'ok', items: [
            { url: 'current', title: 'Current', artist: '', current: true },
            { url: 'request', title: 'Requested song', artist: '', current: false },
            { url: 'auto', title: 'Autoplay', artist: '', current: false },
        ] }),
    } });
    playback.getRoomByChatId.mockResolvedValue({ id: 'room', Feature: { requesterDisplay } });
    playback.getQueues.mockResolvedValue([
        { url: 'request', title: 'Requested song', requesterDisplayName: 'Alex <3 & friends' },
        { url: 'legacy', title: 'Legacy', requesterDisplayName: null },
    ]);
    const { ctx } = groupContext();
    await controller.getQueues(ctx);
    const [message] = ctx.reply.mock.calls[0] as [string];
    const lines = message.split('\n');
    expect(lines.find((line) => line.includes('Requested song'))).toBe(label ? `1. Requested song — ${label}` : '1. Requested song');
    expect(lines).toContain(requesterDisplay === 'anonymous' ? '2. Legacy — Requested by Anonymous' : '2. Legacy');
    expect(lines).toContain('▶ Current');
    expect(lines).toContain('1. Autoplay');
    expect(message).not.toContain('Alex <3 & friends');
});

it.each([
    ['administrator', 'name', true],
    ['administrator', 'anonymous', true],
    ['administrator', 'hidden', true],
    ['administrator', '__proto__', false],
    ['member', 'name', false],
] as const)('applies requester display for %s / %s only when authorized and valid', async (status, mode, allowed) => {
    const roomChanged = jest.fn();
    const { controller, playback } = buildController({ gateway: { roomChanged } });
    playback.setFeature = jest.fn().mockResolvedValue(undefined);
    const { ctx } = groupContext({ status });
    ctx.match = ['', `requester-display:${mode}`];
    ctx.callbackQuery = { message: { chat: { id: -100 }, message_thread_id: 42 } };
    ctx.editMessageText = jest.fn();
    await controller.updateConfig(ctx);
    if (allowed) {
        expect(playback.setFeature).toHaveBeenCalledWith('room', 'requesterDisplay', mode);
        expect(roomChanged).toHaveBeenCalledWith('room');
    } else {
        expect(playback.setFeature).not.toHaveBeenCalled();
        expect(roomChanged).not.toHaveBeenCalled();
    }
});

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
                expect.stringContaining('https://party.example/#test-code'),
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

it('publishes room changes when Telegram configuration changes', async () => {
    const roomChanged = jest.fn();
    const { controller, playback } = buildController({ gateway: { roomChanged } });
    playback.setFeature = jest.fn().mockResolvedValue(undefined);
    const { ctx } = groupContext({ status: 'administrator' });
    ctx.match = ['', 'toggle:allowVideoSearch'];
    ctx.callbackQuery = { message: { chat: { id: -100 } } };
    ctx.editMessageText = jest.fn();
    await controller.updateConfig(ctx);
    expect(playback.setFeature).toHaveBeenCalledWith('room', 'allowVideoSearch', true);
    expect(roomChanged).toHaveBeenCalledWith('room');
});
