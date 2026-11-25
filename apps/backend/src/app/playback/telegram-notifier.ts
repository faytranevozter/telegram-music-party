import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { PlaybackNotification } from 'src/types/playback.type';
import { escapeHtml } from 'src/helpers/util';

/**
 * All outgoing Telegram traffic. This is the only place that talks to the bot,
 * so the rest of the backend can stay transport-neutral.
 */
@Injectable()
export class TelegramNotifier {
    constructor(@InjectBot() private readonly bot: Telegraf<Context>) {}

    async sendMessage(
        chatId: string,
        threadId: number | null,
        message: string,
        parseMode: 'HTML' | 'Markdown' = 'Markdown',
    ) {
        await this.bot.telegram.sendMessage(chatId, message, {
            parse_mode: parseMode,
            ...(threadId ? { message_thread_id: threadId } : {}),
        });
    }

    async sendPlaybackNotification(
        chatId: string,
        threadId: number | null,
        notification: PlaybackNotification,
    ) {
        let message: string;

        switch (notification.type) {
            case 'queue-empty':
                message = '🚫 No tracks in the queue right now.';
                break;
            case 'now-playing':
                message = `Now playing: <i>"${escapeHtml(notification.song)}"</i> by ${escapeHtml(notification.artist)} 🎧`;
                break;
            case 'paused':
                message = `⏸️ <i>${escapeHtml(notification.song)}</i> - ${escapeHtml(notification.artist)} is now paused`;
                break;
            case 'resumed':
                message = `▶️ <i>${escapeHtml(notification.song)}</i> - ${escapeHtml(notification.artist)} resumed`;
                break;
            case 'volume-changed':
                message = `🔊 Volume ${notification.direction}. Current volume: ${escapeHtml(notification.volume)}`;
                break;
            case 'mute-changed':
                message = notification.muted
                    ? "🤫 Shhh... we're on mute. Enjoy the silence (for now)!"
                    : "🎶 We're back! Audio unmuted—let the music play!";
                break;
            case 'lyrics':
                message = escapeHtml(
                    notification.text ||
                        "🤷‍♀️ No lyrics this time—guess we're freestyling!",
                );
                break;
            case 'queue-unavailable':
                message = `⚠️ <i>"${escapeHtml(notification.song)}"</i> could not be added — YouTube Music refused it (usually a region or premium restriction). Skipped it; try another result.`;
                break;
            default:
                return;
        }

        await this.sendMessage(chatId, threadId, message, 'HTML');
    }
}
