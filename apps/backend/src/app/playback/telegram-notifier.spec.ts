import { Context, Telegraf } from 'telegraf';
import { PlaybackNotification } from 'src/types/playback.type';
import { TelegramNotifier } from './telegram-notifier';

describe('TelegramNotifier playback notifications', () => {
    const sendMessage = jest.fn();
    const bot = {
        telegram: { sendMessage },
    } as unknown as Telegraf<Context>;
    let notifier: TelegramNotifier;

    beforeEach(() => {
        sendMessage.mockReset();
        sendMessage.mockResolvedValue(undefined);
        notifier = new TelegramNotifier(bot);
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
        {
            notification: {
                type: 'queue-unavailable',
                videoId: 'dQw4w9WgXcQ',
                song: 'Song & <restricted>',
            },
            message:
                '⚠️ <i>"Song &amp; &lt;restricted&gt;"</i> could not be added — YouTube Music refused it (usually a region or premium restriction). Skipped it; try another result.',
        },
    ])(
        'formats $notification.type notifications',
        async ({ notification, message }) => {
            await notifier.sendPlaybackNotification(
                'chat-id',
                42,
                notification,
            );

            expect(sendMessage).toHaveBeenCalledWith('chat-id', message, {
                parse_mode: 'HTML',
                message_thread_id: 42,
            });
        },
    );

    it('omits the topic outside a Telegram thread', async () => {
        await notifier.sendPlaybackNotification('chat-id', null, {
            type: 'queue-empty',
        });

        expect(sendMessage).toHaveBeenCalledWith(
            'chat-id',
            '🚫 No tracks in the queue right now.',
            { parse_mode: 'HTML' },
        );
    });

    it('ignores unknown notification types', async () => {
        await notifier.sendPlaybackNotification('chat-id', null, {
            type: 'unknown',
        } as unknown as PlaybackNotification);

        expect(sendMessage).not.toHaveBeenCalled();
    });
});
