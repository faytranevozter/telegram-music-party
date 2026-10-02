import { Context, Telegraf } from 'telegraf';
import { PrismaService } from 'src/platform/prisma.service';
import { PlaybackNotification } from 'src/types/playback.type';
import { PlaybackService } from './playback.service';

describe('PlaybackService notifications', () => {
    const sendMessage = jest.fn();
    const bot = {
        telegram: { sendMessage },
    } as unknown as Telegraf<Context>;
    const prisma = {} as PrismaService;
    let service: PlaybackService;

    beforeEach(() => {
        sendMessage.mockReset();
        sendMessage.mockResolvedValue(undefined);
        service = new PlaybackService(prisma, bot);
    });

    it.each<{
        notification: PlaybackNotification;
        message: string;
    }>([
        {
            notification: { type: 'queue-empty' },
            message: '🚫 No tracks in the queue right now.',
        },
        {
            notification: {
                type: 'now-playing',
                song: 'Song <live>',
                artist: 'Artist & Friends',
            },
            message:
                'Now playing: <i>"Song &lt;live&gt;"</i> by Artist &amp; Friends 🎧',
        },
        {
            notification: {
                type: 'paused',
                song: 'Song',
                artist: 'Artist',
            },
            message: '⏸️ <i>Song</i> - Artist is now paused',
        },
        {
            notification: {
                type: 'volume-changed',
                direction: 'increased',
                volume: 75,
            },
            message: '🔊 Volume increased. Current volume: 75',
        },
        {
            notification: { type: 'mute-changed', muted: true },
            message: "🤫 Shhh... we're on mute. Enjoy the silence (for now)!",
        },
        {
            notification: { type: 'mute-changed', muted: false },
            message: "🎶 We're back! Audio unmuted—let the music play!",
        },
        {
            notification: { type: 'lyrics', text: 'One & <two>' },
            message: 'One &amp; &lt;two&gt;',
        },
        {
            notification: { type: 'lyrics', text: null },
            message: "🤷‍♀️ No lyrics this time—guess we're freestyling!",
        },
    ])(
        'formats $notification.type notifications',
        async ({ notification, message }) => {
            await service.sendPlaybackNotification('chat-id', 42, notification);

            expect(sendMessage).toHaveBeenCalledWith('chat-id', message, {
                parse_mode: 'HTML',
                message_thread_id: 42,
            });
        },
    );

    it('omits the topic outside a Telegram thread', async () => {
        await service.sendPlaybackNotification('chat-id', null, {
            type: 'queue-empty',
        });

        expect(sendMessage).toHaveBeenCalledWith(
            'chat-id',
            '🚫 No tracks in the queue right now.',
            { parse_mode: 'HTML' },
        );
    });

    it('ignores unknown notification types', async () => {
        await service.sendPlaybackNotification('chat-id', null, {
            type: 'unknown',
        } as unknown as PlaybackNotification);

        expect(sendMessage).not.toHaveBeenCalled();
    });
});
