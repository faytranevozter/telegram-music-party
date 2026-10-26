import {
    Ctx,
    Start,
    Command,
    On,
    Action,
    Update,
    InlineQuery,
    Next,
} from 'nestjs-telegraf';
import { Context, Markup, NarrowedContext } from 'telegraf';
import { PlaybackGateway } from './playback.gateway';
import {
    CallbackQuery,
    InlineKeyboardButton,
    InlineQueryResult,
    Update as UpdateType,
} from 'telegraf/types';
import { PlaybackService } from './playback.service';
import { AnalyticsService } from 'src/app/analytics/analytics.service';
import { getRandomHumanReadable } from '@marianmeres/random-human-readable';
import { YTMusicService } from 'src/platform/yt-music.service';
import {
    escapeHtml,
    formatDateTime,
    formatDuration,
    htmlBold,
    htmlCode,
    htmlCodeBlock,
    htmlItalic,
} from 'src/helpers/util';
import { firstValueFrom } from 'rxjs';
import { Inject } from '@nestjs/common';
import { InlineChatLocation, Song } from 'src/types/cache.type';
import type { AutoplayResult } from 'src/types/playback.type';
import Keyv from 'keyv';
import { validateConfigNumber } from 'src/helpers/validation';
import type { Feature } from '@prisma/client';

const SONG_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

const getThreadId = (ctx: Context): number | null => {
    const msg = (ctx.msg ?? ctx.editedMessage) as
        | {
              message_thread_id?: number;
          }
        | undefined
        | null;
    if (msg && typeof msg.message_thread_id === 'number') {
        return msg.message_thread_id;
    }
    return null;
};

const getThreadIdFromMessage = (
    message: { message_thread_id?: number } | undefined | null,
): number | null => {
    if (message && typeof message.message_thread_id === 'number') {
        return message.message_thread_id;
    }
    return null;
};

const CONFIG_FIELDS = {
    minimumVotes: {
        label: 'Minimum Votes',
        type: 'number',
        min: 1,
        help: 'Votes needed for /vote_next',
    },
    maxQueueSize: {
        label: 'Max Queue Size',
        type: 'number',
        min: 1,
        help: 'Maximum songs waiting in queue',
    },
    playNextCommand: {
        label: 'Play Next Button',
        type: 'boolean',
        help: 'Allow inline Play Next button',
    },
    dailyPlayNextLimit: {
        label: 'Daily Play Next Limit',
        type: 'number',
        min: 0,
        help: 'Per-user daily Play Next limit; 0 = unlimited',
    },
    nextCommand: {
        label: 'Next Command',
        type: 'boolean',
        help: 'Enable /next command',
    },
    nextOnlyAdmin: {
        label: 'Next Only Admin',
        type: 'boolean',
        help: 'Restrict /next to admins',
    },
    radioCommand: {
        label: 'Radio Command',
        type: 'boolean',
        help: 'Enable /radio from the current song',
    },
    radioOnlyAdmin: {
        label: 'Radio Only Admin',
        type: 'boolean',
        help: 'Restrict /radio to admins',
    },
    refreshCommand: {
        label: 'Refresh Command',
        type: 'boolean',
        help: 'Enable /refresh to reset the queue around the current song',
    },
    refreshOnlyAdmin: {
        label: 'Refresh Only Admin',
        type: 'boolean',
        help: 'Restrict /refresh to admins',
    },
    previousCommand: {
        label: 'Previous Command',
        type: 'boolean',
        help: 'Enable /prev command',
    },
    previousOnlyAdmin: {
        label: 'Previous Only Admin',
        type: 'boolean',
        help: 'Restrict /prev to admins',
    },
    muteCommand: {
        label: 'Mute Command',
        type: 'boolean',
        help: 'Enable /mute command',
    },
    unmuteCommand: {
        label: 'Unmute Command',
        type: 'boolean',
        help: 'Enable /unmute command',
    },
    volumeCommand: {
        label: 'Volume Command',
        type: 'boolean',
        help: 'Enable volume commands',
    },
} as const;

const CONFIG_KEYS = Object.keys(CONFIG_FIELDS) as Array<
    keyof typeof CONFIG_FIELDS
>;
const NUMBER_CONFIG_KEYS = CONFIG_KEYS.filter(
    (key) => CONFIG_FIELDS[key].type === 'number',
);
const NUMBER_PRESETS = [0, 1, 3, 5, 10, 25];

type ConfigKey = keyof typeof CONFIG_FIELDS;

type ButtonStyle = 'primary' | 'success' | 'danger';
type StyledButton = ReturnType<typeof Markup.button.callback> & {
    style?: ButtonStyle;
};

const CONFIG_ICONS: Record<ConfigKey, string> = {
    minimumVotes: '🗳️',
    maxQueueSize: '📋',
    playNextCommand: '⏭️',
    dailyPlayNextLimit: '📆',
    nextCommand: '⏩',
    nextOnlyAdmin: '🛡️',
    previousCommand: '⏪',
    previousOnlyAdmin: '🛡️',
    radioCommand: '📻',
    radioOnlyAdmin: '🛡️',
    refreshCommand: '🔄',
    refreshOnlyAdmin: '🛡️',
    muteCommand: '🔇',
    unmuteCommand: '🔊',
    volumeCommand: '🎚️',
};

/** Short labels so buttons stay readable in narrow Telegram clients. */
const CONFIG_BUTTON_LABELS: Record<ConfigKey, string> = {
    minimumVotes: 'Min votes',
    maxQueueSize: 'Max queue',
    playNextCommand: 'Play Next',
    dailyPlayNextLimit: 'Daily limit',
    nextCommand: 'Next',
    nextOnlyAdmin: 'Next admin',
    previousCommand: 'Prev',
    previousOnlyAdmin: 'Prev admin',
    radioCommand: 'Radio',
    radioOnlyAdmin: 'Radio admin',
    refreshCommand: 'Refresh',
    refreshOnlyAdmin: 'Refresh admin',
    muteCommand: 'Mute',
    unmuteCommand: 'Unmute',
    volumeCommand: 'Volume',
};

@Update()
export class PlaybackTelegramController {
    constructor(
        @Inject('KEYV_CACHE') private cacheManager: Keyv,
        private readonly gateway: PlaybackGateway,
        private readonly playbackService: PlaybackService,
        private readonly analyticsService: AnalyticsService,
        private readonly ytmusicService: YTMusicService,
    ) {}

    /** Remember where this user last interacted (chat + topic) for inline callbacks. */
    private async rememberUserLocation(
        userId: number | undefined,
        chatId: string,
        threadId: number | null,
    ) {
        if (!userId || !chatId) return;
        await this.cacheManager.set<InlineChatLocation>(
            `user-loc:${userId}`,
            { chatId, threadId },
            SONG_CACHE_TTL,
        );
    }

    private isMessageNotModifiedError(error: unknown) {
        const description =
            error && typeof error === 'object' && 'response' in error
                ? String(
                      (error as { response?: { description?: string } })
                          .response?.description ?? '',
                  )
                : error instanceof Error
                  ? error.message
                  : '';
        return description.includes('message is not modified');
    }

    /** Run a Telegram edit; ignore "message is not modified" (idempotent retries). */
    private async safeEdit(fn: () => Promise<unknown>) {
        try {
            await fn();
        } catch (error) {
            if (this.isMessageNotModifiedError(error)) return;
            throw error;
        }
    }

    private getLocalDateKey() {
        const now = new Date();
        const year = now.getFullYear();
        const month = `${now.getMonth() + 1}`.padStart(2, '0');
        const day = `${now.getDate()}`.padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private getMillisecondsUntilLocalMidnight() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        return midnight.getTime() - now.getTime();
    }

    private async isRoomAdmin(ctx: Context, chatId: string, userId: number) {
        if (ctx.chat?.type === 'private') return true;
        const chatMember = await ctx.telegram.getChatMember(chatId, userId);
        return ['administrator', 'creator'].includes(chatMember?.status);
    }

    private async getPlayNextCount(roomId: string, userId: number) {
        return (
            (await this.cacheManager.get<number>(
                `playnext-daily:${roomId}:${userId}:${this.getLocalDateKey()}`,
            )) || 0
        );
    }

    private async incrementPlayNextCount(roomId: string, userId: number) {
        const key = `playnext-daily:${roomId}:${userId}:${this.getLocalDateKey()}`;
        const count = ((await this.cacheManager.get<number>(key)) || 0) + 1;
        await this.cacheManager.set(
            key,
            count,
            this.getMillisecondsUntilLocalMidnight() + 60_000,
        );
    }

    private formatConfigValue(feature: Feature, key: ConfigKey) {
        const value = feature[key];
        if (typeof value === 'boolean') return value ? 'on' : 'off';
        if (key === 'dailyPlayNextLimit' && value === 0) return 'unlimited';
        if (key === 'dailyPlayNextLimit') return `${value}/day`;
        return `${value}`;
    }

    private async getPlayNextRemaining(
        room: {
            id: string;
            Feature: Feature | null;
        },
        userId: number,
    ) {
        const limit = room.Feature?.dailyPlayNextLimit || 0;
        if (limit <= 0) return null;
        const used = await this.getPlayNextCount(room.id, userId);
        return Math.max(limit - used, 0);
    }

    private formatPlayNextLabel(
        feature: Feature | null,
        remaining: number | null,
    ): string | null {
        if (!feature?.playNextCommand) return null;
        if (remaining === null) return 'Play Next';
        return remaining <= 0
            ? 'Play Next (0 left)'
            : `Play Next (${remaining} left)`;
    }

    private formatConfigLine(feature: Feature, key: ConfigKey) {
        return `• ${htmlBold(CONFIG_FIELDS[key].label)}: ${escapeHtml(this.formatConfigValue(feature, key))}`;
    }

    private buildConfigText(feature: Feature) {
        return [
            `🎛️ ${htmlBold('Room Configuration')}`,
            '',
            htmlBold('Queue'),
            this.formatConfigLine(feature, 'maxQueueSize'),
            this.formatConfigLine(feature, 'playNextCommand'),
            this.formatConfigLine(feature, 'dailyPlayNextLimit'),
            '',
            htmlBold('Playback Controls'),
            this.formatConfigLine(feature, 'nextCommand'),
            this.formatConfigLine(feature, 'nextOnlyAdmin'),
            this.formatConfigLine(feature, 'previousCommand'),
            this.formatConfigLine(feature, 'previousOnlyAdmin'),
            this.formatConfigLine(feature, 'radioCommand'),
            this.formatConfigLine(feature, 'radioOnlyAdmin'),
            this.formatConfigLine(feature, 'refreshCommand'),
            this.formatConfigLine(feature, 'refreshOnlyAdmin'),
            '',
            htmlBold('Audio'),
            this.formatConfigLine(feature, 'muteCommand'),
            this.formatConfigLine(feature, 'unmuteCommand'),
            this.formatConfigLine(feature, 'volumeCommand'),
            '',
            htmlBold('Voting'),
            this.formatConfigLine(feature, 'minimumVotes'),
            '',
            htmlItalic('Tap a button below to change settings.'),
        ].join('\n');
    }

    private styledButton(
        text: string,
        data: string,
        style?: ButtonStyle,
    ): StyledButton {
        const button = Markup.button.callback(text, data) as StyledButton;
        if (style) button.style = style;
        return button;
    }

    private configToggleButton(feature: Feature, key: ConfigKey) {
        const enabled = feature[key] as boolean;
        return this.styledButton(
            `${CONFIG_ICONS[key]} ${CONFIG_BUTTON_LABELS[key]}: ${enabled ? 'on' : 'off'}`,
            `config:toggle:${key}`,
            enabled ? 'success' : 'danger',
        );
    }

    private configNumberButton(feature: Feature, key: ConfigKey) {
        return this.styledButton(
            `${CONFIG_ICONS[key]} ${CONFIG_BUTTON_LABELS[key]}: ${this.formatConfigValue(feature, key)}`,
            `config:number:${key}`,
            'primary',
        );
    }

    private buildConfigKeyboard(feature: Feature) {
        const toggle = (key: ConfigKey) =>
            this.configToggleButton(feature, key);
        return Markup.inlineKeyboard([
            [toggle('playNextCommand')],
            [toggle('nextCommand')],
            [toggle('nextOnlyAdmin')],
            [toggle('previousCommand')],
            [toggle('previousOnlyAdmin')],
            [toggle('radioCommand')],
            [toggle('radioOnlyAdmin')],
            [toggle('refreshCommand')],
            [toggle('refreshOnlyAdmin')],
            [toggle('muteCommand')],
            [toggle('unmuteCommand')],
            [toggle('volumeCommand')],
            ...NUMBER_CONFIG_KEYS.map((key) => [
                this.configNumberButton(feature, key),
            ]),
            [this.styledButton('✖️ Close', 'config:close', 'danger')],
        ]);
    }

    private buildSongKeyboard(
        playNextLabel: string | null,
        senderID: number,
        videoId: string,
    ) {
        const rows = [
            ...(playNextLabel
                ? [
                      [
                          Markup.button.callback(
                              playNextLabel,
                              `playnext:${senderID}:${videoId}`,
                          ),
                      ],
                  ]
                : []),
            [
                Markup.button.callback(
                    'Add to Queue',
                    `queue:${senderID}:${videoId}`,
                ),
            ],
            [Markup.button.callback('Cancel', `cancel:${senderID}`)],
        ];
        return Markup.inlineKeyboard(rows);
    }

    private async resolvePlayNextLabel(
        chatId: string,
        threadId: number | null,
        userId: number,
    ): Promise<string | null> {
        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        // Hide until we know the room has Play Next enabled.
        if (!room?.Feature) return null;
        const remaining = await this.getPlayNextRemaining(room, userId);
        return this.formatPlayNextLabel(room.Feature, remaining);
    }

    private buildNumberKeyboard(key: ConfigKey) {
        const field = CONFIG_FIELDS[key];
        const min = field.type === 'number' ? field.min : 1;
        const presets = NUMBER_PRESETS.filter((value) => value >= min).map(
            (value) =>
                this.styledButton(
                    `${value}`,
                    `config:set:${key}:${value}`,
                    'primary',
                ),
        );
        const presetRows: StyledButton[][] = [];
        for (let i = 0; i < presets.length; i += 3) {
            presetRows.push(presets.slice(i, i + 3));
        }
        return Markup.inlineKeyboard([
            ...presetRows,
            [this.styledButton('✏️ Custom', `config:custom:${key}`, 'primary')],
            [
                this.styledButton('◀️ Back', 'config:back', 'primary'),
                this.styledButton('✖️ Close', 'config:close', 'danger'),
            ],
        ]);
    }

    private getCallbackLocation(ctx: Context) {
        const message = ctx.callbackQuery?.message as
            | {
                  chat?: { id: number };
                  message_thread_id?: number;
              }
            | undefined;
        const chatId = message?.chat?.id.toString() || '';
        const threadId = getThreadIdFromMessage(message);
        return { chatId, threadId };
    }

    private async ensureConfigAdmin(ctx: Context, chatId: string) {
        if (!chatId) return false;
        if (ctx.chat?.type === 'private') return true;
        const userId = ctx.from?.id || 0;
        const chatMember = await ctx.telegram.getChatMember(chatId, userId);
        return ['administrator', 'creator'].includes(chatMember?.status);
    }

    private async editConfigMessage(
        ctx: Context,
        chatId: string,
        threadId: number | null,
    ) {
        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room?.Feature) return;
        const feature = room.Feature;
        await this.safeEdit(() =>
            ctx.editMessageText(this.buildConfigText(feature), {
                parse_mode: 'HTML',
                ...this.buildConfigKeyboard(feature),
            }),
        );
    }

    @Start()
    async start(@Ctx() ctx: Context) {
        await ctx.reply(
            [
                `🎵 ${htmlBold('Music Party')}`,
                '',
                '1. Run /register in your group',
                '2. Copy the room ID',
                '3. Install the extension',
                '4. Open YouTube Music and paste the room ID',
                '5. Search with @botname and add songs',
                '6. Run /play to start',
                '',
                htmlItalic(
                    'Tip: use /info, /queue, /stats, and /config anytime.',
                ),
            ].join('\n'),
            { parse_mode: 'HTML' },
        );
    }

    @Command('register')
    async register(
        @Ctx()
        ctx: Context & {
            chat: { members_count?: number };
            message: { chat: { title: string } };
        },
    ) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        // if not in private chat
        if (ctx.chat.type !== 'private') {
            // only admins can register & unregister
            const userId = ctx.from?.id || 0;
            const chatMember = await ctx.getChatMember(userId);
            const isAdmin = ['administrator', 'creator'].includes(
                chatMember?.status,
            );
            if (!isAdmin) {
                await ctx.reply(
                    'Only admins can register the bot. Please contact an admin to register.',
                );
                return;
            }
        }

        // get room from current chat id
        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (room) {
            await ctx.reply(
                [
                    `✅ ${htmlBold('Room already linked')}`,
                    '',
                    'Room ID',
                    htmlCodeBlock(room.id),
                    htmlItalic('Paste this into the Music Party extension.'),
                ].join('\n'),
                { parse_mode: 'HTML' },
            );
            return;
        }

        // generate readable room id
        const roomId = getRandomHumanReadable({
            adjCount: 1,
            colorsCount: 0,
            nounsCount: 2,
            joinWith: '-',
        }) as string;

        await this.playbackService.addRoom(
            roomId,
            chatId,
            threadId,
            ctx.message?.chat.title || '',
        );

        await ctx.reply(
            [
                `✅ ${htmlBold('Room registered')}`,
                '',
                'Room ID',
                htmlCodeBlock(roomId),
                htmlItalic('Paste this into the Music Party extension.'),
            ].join('\n'),
            { parse_mode: 'HTML' },
        );
    }

    @Command('unregister')
    async unregister(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const userId = ctx.from?.id || 0;

        if (ctx.chat?.type !== 'private') {
            // only admins can register & unregister
            const chatMember = await ctx.getChatMember(userId);
            const isAdmin = ['administrator', 'creator'].includes(
                chatMember?.status,
            );
            if (!isAdmin) {
                await ctx.reply(
                    'Only admins can unregister the bot. Please contact an admin to unregister.',
                );
                return;
            }
        }

        // add message confirmation
        await ctx.reply(
            'Are you sure you want to unregister the bot? This will remove all queues and devices.',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '‼️ Confirm',
                        `unregister:${userId}`,
                    ),
                    Markup.button.callback('Cancel', `cancel:${userId}`),
                ],
            ]),
        );
    }

    @Action(/unregister:(.*)/)
    async unregisterYes(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const userId = (ctx.from?.id || 0).toString();

        const [userIdFromAction] = ctx.match[1].split(':');

        if (userId !== userIdFromAction) {
            await ctx.answerCbQuery(
                'Nice try, but you are not allowed to do this',
            );
            return;
        }

        await ctx.answerCbQuery('Unregistering...');

        // remove room
        await this.playbackService.removeRoom(room.id);

        // emit leave
        this.gateway.leave(room.id);

        await this.safeEdit(() =>
            ctx.editMessageText(`You've exited the room. Bye for now! ✌️`),
        );
    }

    @Command('play')
    async play(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;

        // check connected devices
        if (!room || room.Devices.length === 0) {
            await ctx.reply('No devices connected');
            return;
        }

        // check connected sockets
        const connectedClients = await firstValueFrom(
            this.gateway.countConnectedClients(roomId),
        );

        if (connectedClients === 0) {
            await ctx.reply('No clients connected');
            return;
        }

        // emit play command
        this.gateway.playCommand(roomId);
    }

    @Command('pause')
    async pause(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;
        this.gateway.pauseCommand(roomId);
        // await ctx.reply('Paused');
    }

    @Command('next')
    async next(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        // check if feature is enabled
        if (room.Feature && room.Feature.nextCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        if (room.Feature && room.Feature.nextOnlyAdmin === true) {
            // if not in private chat
            if (ctx.chat?.type !== 'private') {
                // only admins can register & unregister
                const userId = ctx.from?.id || 0;
                const chatMember = await ctx.getChatMember(userId);
                const isAdmin = ['administrator', 'creator'].includes(
                    chatMember?.status,
                );
                if (!isAdmin) {
                    await ctx.reply(
                        '⚠️ This feature is available for admin only.',
                    );
                    return;
                }
            }
        }

        this.gateway.nextCommand(room.id);
    }

    @Command('prev')
    async prev(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        // check if feature is enabled
        if (room.Feature && room.Feature.previousCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        if (room.Feature && room.Feature.previousOnlyAdmin === true) {
            // if not in private chat
            if (ctx.chat?.type !== 'private') {
                // only admins can register & unregister
                const userId = ctx.from?.id || 0;
                const chatMember = await ctx.getChatMember(userId);
                const isAdmin = ['administrator', 'creator'].includes(
                    chatMember?.status,
                );
                if (!isAdmin) {
                    await ctx.reply(
                        '⚠️ This feature is available for admin only.',
                    );
                    return;
                }
            }
        }

        this.gateway.previousCommand(room.id);
    }

    private async autoplayAccessError(
        ctx: Context,
        feature: Feature | null,
        enabled: boolean,
        onlyAdmin: boolean,
    ): Promise<'disabled' | 'admin' | null> {
        if (feature && !enabled) return 'disabled';

        if (feature && onlyAdmin && ctx.chat?.type !== 'private') {
            const chatId = ctx.chat?.id;
            const userId = ctx.from?.id || 0;
            if (!chatId) return 'admin';
            const chatMember = await ctx.telegram.getChatMember(chatId, userId);
            if (!['administrator', 'creator'].includes(chatMember?.status)) {
                return 'admin';
            }
        }

        return null;
    }

    private async checkAutoplayAccess(
        ctx: Context,
        feature: Feature | null,
        enabled: boolean,
        onlyAdmin: boolean,
    ): Promise<boolean> {
        const error = await this.autoplayAccessError(
            ctx,
            feature,
            enabled,
            onlyAdmin,
        );
        if (error === 'disabled') {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return false;
        }
        if (error === 'admin') {
            await ctx.reply('⚠️ This feature is available for admin only.');
            return false;
        }
        return true;
    }

    private buildAutoplayResultText(
        result: AutoplayResult,
        mode: 'radio' | 'refresh',
    ) {
        const radio = mode === 'radio';
        switch (result.status) {
            case 'ok':
                return [
                    radio
                        ? `📻 ${htmlBold('Radio started')}`
                        : `🔄 ${htmlBold('Queue refreshed')}`,
                    radio
                        ? `Recommendations now follow ${htmlItalic(result.song || 'the current song')}.`
                        : `Only ${htmlItalic(result.song || 'the current song')} is queued; autoplay follows it.`,
                ].join('\n');
            case 'offline':
                return 'No player connected. Open YouTube Music and join this room.';
            case 'timeout':
                return 'The player did not respond. Try again shortly, and make sure your extension is up to date.';
            case 'no-current-song':
                return 'Nothing is playing right now. Start a song first.';
            default:
                return radio
                    ? 'Could not start radio. Make sure the current song supports radio and your extension is up to date.'
                    : 'Could not refresh the queue. Make sure something is playing and your extension is up to date.';
        }
    }

    private async editAutoplayResult(
        ctx: Context,
        result: AutoplayResult,
        mode: 'radio' | 'refresh',
    ) {
        await this.safeEdit(() =>
            ctx.editMessageText(this.buildAutoplayResultText(result, mode), {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [] },
            }),
        );
    }

    private async askAutoplayConfirmation(
        ctx: Context,
        mode: 'radio' | 'refresh',
    ) {
        const radio = mode === 'radio';
        await ctx.reply(
            [
                radio
                    ? `📻 ${htmlBold('Start radio?')}`
                    : `🔄 ${htmlBold('Refresh queue?')}`,
                radio
                    ? 'The player queue will be replaced with a radio based on the current song.'
                    : 'The player queue will reset to the current song, with autoplay after it.',
                '',
                htmlItalic('Songs requested through the bot are kept.'),
            ].join('\n'),
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        this.styledButton(
                            radio ? '📻 Start radio' : '🔄 Refresh queue',
                            `autoplay:${mode}`,
                            'primary',
                        ),
                    ],
                    [
                        this.styledButton(
                            '✖️ Cancel',
                            'autoplay:cancel',
                            'danger',
                        ),
                    ],
                ]),
            },
        );
    }

    @Action(/autoplay:(radio|refresh|cancel)/)
    async confirmAutoplay(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
        const action = ctx.match[1] as 'radio' | 'refresh' | 'cancel';
        const { chatId, threadId } = this.getCallbackLocation(ctx);

        if (action === 'cancel') {
            await ctx.answerCbQuery('Canceled');
            await this.safeEdit(() =>
                ctx.editMessageText('✖️ Canceled.', {
                    reply_markup: { inline_keyboard: [] },
                }),
            );
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.answerCbQuery('No room found');
            await this.safeEdit(() =>
                ctx.editMessageText('🏠 No room found.', {
                    reply_markup: { inline_keyboard: [] },
                }),
            );
            return;
        }

        const radio = action === 'radio';
        const error = await this.autoplayAccessError(
            ctx,
            room.Feature,
            radio
                ? room.Feature?.radioCommand === true
                : room.Feature?.refreshCommand === true,
            radio
                ? room.Feature?.radioOnlyAdmin === true
                : room.Feature?.refreshOnlyAdmin === true,
        );
        if (error === 'disabled') {
            await ctx.answerCbQuery('Feature disabled');
            await this.safeEdit(() =>
                ctx.editMessageText('⚠️ This feature is currently disabled.', {
                    reply_markup: { inline_keyboard: [] },
                }),
            );
            return;
        }
        if (error === 'admin') {
            await ctx.answerCbQuery('Admin only');
            return;
        }

        const messageId = ctx.callbackQuery?.message?.message_id;
        const lockKey = `autoplay-lock:${chatId}:${threadId ?? 'root'}:${messageId ?? 'unknown'}:${action}`;
        if (await this.cacheManager.get(lockKey)) {
            await ctx.answerCbQuery('Already running');
            return;
        }
        await this.cacheManager.set(lockKey, true, 60_000);

        await ctx.answerCbQuery(
            radio ? 'Starting radio...' : 'Refreshing queue...',
        );

        const result = radio
            ? await this.gateway.startRadio(room.id)
            : await this.gateway.refreshAutoplay(room.id);

        await this.editAutoplayResult(ctx, result, action);
    }

    @Command('radio')
    async radio(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        if (
            !(await this.checkAutoplayAccess(
                ctx,
                room.Feature,
                room.Feature?.radioCommand === true,
                room.Feature?.radioOnlyAdmin === true,
            ))
        ) {
            return;
        }

        await this.askAutoplayConfirmation(ctx, 'radio');
    }

    @Command('refresh')
    async refresh(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        if (
            !(await this.checkAutoplayAccess(
                ctx,
                room.Feature,
                room.Feature?.refreshCommand === true,
                room.Feature?.refreshOnlyAdmin === true,
            ))
        ) {
            return;
        }

        await this.askAutoplayConfirmation(ctx, 'refresh');
    }

    @Command('mute')
    async mute(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        // check if feature is enabled
        if (room.Feature && room.Feature.muteCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        this.gateway.muteCommand(room.id);
    }

    @Command('unmute')
    async unmute(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        // check if feature is enabled
        if (room.Feature && room.Feature.unmuteCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        this.gateway.unmuteCommand(room.id);
    }

    @Command('lyrics')
    async lyrics(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        this.gateway.lyricsCommand(room.id);
    }

    @Command('volume_up')
    async volumeUp(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        // check if feature is enabled
        if (room.Feature && room.Feature.volumeCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        this.gateway.volumeUp(room.id);
    }

    @Command('volume_down')
    async volumeDown(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        // check if feature is enabled
        if (room.Feature && room.Feature.volumeCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        this.gateway.volumeDown(room.id);
    }

    @Command('devices')
    async devices(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getDevicesByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        if (room.Devices.length == 0) {
            await ctx.reply('No devices connected');
            return;
        }

        await ctx.reply(
            [
                `🖥️ ${htmlBold('Connected Devices')}`,
                htmlItalic(`${room.Devices.length} device(s)`),
                '',
                room.Devices.map((d, i) =>
                    [
                        htmlBold(`${i + 1}. ${d.name}`),
                        `ID: ${htmlCode(d.fingerprint)}`,
                        `Joined: ${escapeHtml(formatDateTime(d.createdAt))}`,
                    ].join('\n'),
                ).join('\n\n'),
            ].join('\n'),
            { parse_mode: 'HTML' },
        );
    }

    @Command('vote_next')
    async vote_next(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getDevicesByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        // check already voted
        const userId = ctx.from?.id.toString() || '';
        const alreadyVoted = room.Votes.find((v) => v.userId === userId);
        if (alreadyVoted) {
            await ctx.reply(
                `Nice try, DJ—but you've already voted! Let's see what the others pick 🎧`,
            );
            return;
        }

        const MINIMUM_VOTE = room.Feature ? room.Feature.minimumVotes : 5;

        // if will be last voter reach minimum vote
        if (room.Votes.length + 1 >= MINIMUM_VOTE) {
            // emit next command
            this.gateway.nextCommand(room.id);

            await ctx.reply(
                [
                    '🗳️ The people have spoken.',
                    'Minimum votes reached, and the next song has been chosen. Let the music play!',
                ].join('\n'),
            );
            return;
        }

        // add vote
        await this.playbackService.addVote(room.id, userId);

        const randomText = [
            `We're at ${room.Votes.length + 1}/${MINIMUM_VOTE} votes for the next track—who's holding us up? 😄`,
            `${room.Votes.length + 1}/${MINIMUM_VOTE} votes locked! ${MINIMUM_VOTE - (room.Votes.length + 1)} more to go—your pick could change everything 🔥`,
            `Only ${room.Votes.length + 1} out of ${MINIMUM_VOTE} votes so far... who's lagging behind? 😏`,
            `The fate of the next track hangs in the balance… only ${room.Votes.length + 1}/${MINIMUM_VOTE} votes in. Who will decide what's next? 🎭`,
            `Just ${room.Votes.length + 1}/${MINIMUM_VOTE} votes in for the next track—don't be shy, cast yours! 🎶`,
        ];

        // send message
        await ctx.reply(
            randomText[Math.floor(Math.random() * randomText.length)],
        );
    }

    @Command('config')
    async getFeature(
        @Ctx()
        ctx: Context & {
            message: { text: string };
        },
    ) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const feature = room.Feature;

        if (!feature) {
            await ctx.reply('No feature found');
            return;
        }

        // only admin can see this
        // if not in private chat
        if (ctx.chat?.type !== 'private') {
            // only admins can register & unregister
            const userId = ctx.from?.id || 0;
            const chatMember = await ctx.getChatMember(userId);
            const isAdmin = ['administrator', 'creator'].includes(
                chatMember?.status,
            );
            if (!isAdmin) {
                await ctx.reply('⚠️ This feature is available for admin only.');
                return;
            }
        }

        await ctx.reply(this.buildConfigText(feature), {
            parse_mode: 'HTML',
            ...this.buildConfigKeyboard(feature),
        });
    }

    @Action(/config:(.*)/)
    async updateConfig(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
        const [action, rawKey, rawValue] = ctx.match[1].split(':');
        const { chatId, threadId } = this.getCallbackLocation(ctx);
        if (!(await this.ensureConfigAdmin(ctx, chatId))) {
            await ctx.answerCbQuery('Admin only');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room?.Feature) {
            await ctx.answerCbQuery('No room found');
            return;
        }

        if (action === 'close') {
            await ctx.answerCbQuery('Closed');
            await this.safeEdit(() =>
                ctx.editMessageText('🎛️ Configuration closed.', {
                    reply_markup: { inline_keyboard: [] },
                }),
            );
            return;
        }

        if (action === 'back') {
            await ctx.answerCbQuery('Back');
            await this.editConfigMessage(ctx, chatId, threadId);
            return;
        }

        const key = rawKey as ConfigKey;
        const field = CONFIG_FIELDS[key];
        if (!field) {
            await ctx.answerCbQuery('Unknown setting');
            return;
        }

        if (action === 'toggle' && field.type === 'boolean') {
            const value = !(room.Feature[key] as boolean);
            await this.playbackService.setFeature(room.id, key, value);
            await ctx.answerCbQuery(`Set ${field.label} to ${value}`);
            await this.editConfigMessage(ctx, chatId, threadId);
            return;
        }

        if (action === 'number' && field.type === 'number') {
            await ctx.answerCbQuery(`Choose ${field.label}`);
            await this.safeEdit(() =>
                ctx.editMessageText(
                    [
                        `⚙️ ${htmlBold(field.label)}`,
                        '',
                        escapeHtml(field.help),
                        '',
                        htmlItalic('Choose a preset or tap Custom.'),
                    ].join('\n'),
                    {
                        parse_mode: 'HTML',
                        ...this.buildNumberKeyboard(key),
                    },
                ),
            );
            return;
        }

        if (action === 'set' && field.type === 'number') {
            const errMsg = validateConfigNumber(rawValue, field.min);
            if (errMsg !== '') {
                await ctx.answerCbQuery(errMsg);
                return;
            }
            const value = parseInt(rawValue);
            await this.playbackService.setFeature(room.id, key, value);
            await ctx.answerCbQuery(`Set ${field.label} to ${value}`);
            await this.editConfigMessage(ctx, chatId, threadId);
            return;
        }

        if (action === 'custom' && field.type === 'number') {
            await this.cacheManager.set(
                `config-custom:${ctx.from.id}`,
                { chatId, threadId, key },
                120_000,
            );
            await ctx.answerCbQuery('Send a number');
            await ctx.reply(
                [
                    `✏️ Send a number for ${htmlBold(field.label)}.`,
                    htmlItalic('Send /cancel to abort.'),
                ].join('\n'),
                { parse_mode: 'HTML' },
            );
        }
    }

    @Command('info')
    async getRoomInfo(
        @Ctx()
        ctx: Context & {
            message: { text: string };
        },
    ) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        // load queue
        const queues = await this.playbackService.getQueues(room.id);

        const playNext = room.Feature?.playNextCommand
            ? room.Feature.dailyPlayNextLimit === 0
                ? 'on · unlimited'
                : `on · ${room.Feature.dailyPlayNextLimit}/day`
            : 'off';

        const rows: Array<[string, string]> = [
            ['Room', room.id],
            ['Chat', room.chatId],
        ];
        if (room.threadId != null) {
            rows.push(['Topic', String(room.threadId)]);
        }
        rows.push(
            ['Queue', `${queues.length} song(s)`],
            ['Devices', String(room.Devices.length)],
            ['Play Next', playNext],
            ['Created', formatDateTime(room.createdAt)],
        );

        // Bot API 10.1+ rich HTML table (native client table UI).
        const tableRows = rows
            .map(
                ([label, value]) =>
                    `<tr><td>${escapeHtml(label)}</td><td><code>${escapeHtml(value)}</code></td></tr>`,
            )
            .join('');
        const html = [
            '<h2>🏠 Room Info</h2>',
            `<table bordered striped><tr><th>Field</th><th>Value</th></tr>${tableRows}</table>`,
        ].join('');

        const payload: Record<string, unknown> = {
            chat_id: chatId,
            rich_message: {
                html,
                skip_entity_detection: true,
            },
        };
        if (threadId != null) {
            payload.message_thread_id = threadId;
        }

        // telegraf types do not include sendRichMessage yet
        await ctx.telegram.callApi(
            // @ts-expect-error sendRichMessage not in telegraf types yet
            'sendRichMessage',
            payload,
        );
    }

    @InlineQuery(/.*/)
    async search(
        @Ctx()
        ctx: NarrowedContext<Context<UpdateType>, UpdateType.InlineQueryUpdate>,
    ) {
        try {
            // get songs
            const searchQuery = ctx?.update?.inline_query?.query; // Change to your search keyword

            const inlineQueryID = ctx?.update?.inline_query?.id;
            if (!inlineQueryID) return;

            if (!searchQuery || searchQuery.length < 3) return;

            const songs = await this.ytmusicService.searchSongs(searchQuery);

            const senderID = ctx.from.id;

            // Default: no Play Next button. Show only when last known room has it enabled.
            // chosen_inline_result / via_bot can add the button once the room is known.
            let playNextLabel: string | null = null;
            const userLoc = await this.cacheManager.get<InlineChatLocation>(
                `user-loc:${senderID}`,
            );
            if (userLoc?.chatId) {
                playNextLabel = await this.resolvePlayNextLabel(
                    userLoc.chatId,
                    userLoc.threadId,
                    senderID,
                );
            }

            const cacheExpireTime = 10 * 60 * 1000; // 10 minutes

            const videoIds = new Set<string>();

            const cacheKey = `songs:${inlineQueryID}`;
            const cachedData = await this.cacheManager.get<Song>(cacheKey);
            if (!cachedData) {
                void this.cacheManager.set<Song[]>(
                    cacheKey,
                    songs.map((row) => ({
                        videoId: row.videoId,
                        name: row.name,
                        artist: row.artist,
                        duration: row.duration,
                    })) as Song[],
                    cacheExpireTime,
                );
            }

            await ctx.answerInlineQuery(
                songs
                    .filter((row) => {
                        if (videoIds.has(row.videoId)) return false;

                        videoIds.add(row.videoId);
                        return true;
                    })
                    .map(
                        (row): InlineQueryResult => ({
                            id: `${inlineQueryID}:${row.videoId}`,
                            type: 'article',
                            title: row.name,
                            description: `${row.artist.name} • ${row.album?.name} • ${formatDuration(row.duration || 0)}`,
                            thumbnail_url: row.thumbnails[0].url,
                            input_message_content: {
                                photo_url: row.thumbnails[0].url,
                                message_text: `${row.name} by ${row.artist.name}`,
                            },
                            ...this.buildSongKeyboard(
                                playNextLabel,
                                senderID,
                                row.videoId,
                            ),
                        }),
                    ),
                {},
            );
        } catch (e) {
            console.error(e);
        }
    }

    @On('chosen_inline_result')
    async chosenInlineResult(
        @Ctx()
        ctx: Context<UpdateType.ChosenInlineResultUpdate>,
    ) {
        const { inline_message_id, query } = ctx.update.chosen_inline_result;
        if (!inline_message_id || !query) return;

        // get result id
        const resultId = ctx.update.chosen_inline_result.result_id;

        // get search query id
        const [inlineQueryID, videoId] = resultId.split(':');

        // get from cache
        const cacheKey = `songs:${inlineQueryID}`;
        const cachedSongs = await this.cacheManager.get<Song[]>(cacheKey);
        if (!cachedSongs) {
            await this.safeEdit(() =>
                ctx.telegram.editMessageText(
                    undefined,
                    undefined,
                    inline_message_id,
                    `🔗 This link has expired. Please try generating a new one.`,
                ),
            );
            return;
        }

        // get the song detail
        const song = cachedSongs.find((row) => row.videoId === videoId);
        if (!song) {
            await this.safeEdit(() =>
                ctx.telegram.editMessageText(
                    undefined,
                    undefined,
                    inline_message_id,
                    `⚠️ Something went wrong with the link. Please try again or request a new one.`,
                ),
            );
            return;
        }

        const songText = `${song.name} by ${song.artist.name}`;
        const cacheKeySong = `song:${inline_message_id}:${videoId}`;
        await this.cacheManager.set<Song>(cacheKeySong, song, SONG_CACHE_TTL);

        // Link chat/topic from a via_bot message that may have already arrived
        // (or will arrive next) — needed because callback_query for inline
        // messages has no chat_id / message_thread_id.
        const userId = ctx.from?.id;
        if (userId) {
            await this.cacheManager.set(
                `pending-inline:${userId}`,
                {
                    inline_message_id,
                    videoId,
                    text: songText,
                },
                60_000,
            );

            const recent = await this.cacheManager.get<{
                chatId: string;
                threadId: number | null;
                text?: string;
            }>(`recent-via:${userId}`);
            if (recent?.chatId) {
                await this.cacheManager.set<InlineChatLocation>(
                    `inline-loc:${inline_message_id}`,
                    {
                        chatId: recent.chatId,
                        threadId: recent.threadId,
                    },
                    SONG_CACHE_TTL,
                );

                if (userId) {
                    const label = await this.resolvePlayNextLabel(
                        recent.chatId,
                        recent.threadId,
                        userId,
                    );
                    if (label) {
                        await this.cacheManager.set(
                            `playnext-label:${inline_message_id}`,
                            label,
                            SONG_CACHE_TTL,
                        );
                    } else {
                        await this.cacheManager.delete(
                            `playnext-label:${inline_message_id}`,
                        );
                    }
                    await this.safeEdit(() =>
                        ctx.telegram.editMessageReplyMarkup(
                            undefined,
                            undefined,
                            inline_message_id,
                            this.buildSongKeyboard(label, userId, videoId)
                                .reply_markup,
                        ),
                    );
                }
            }
        }
    }

    /**
     * Cache chat + topic for every message the bot receives so inline
     * "Add to Queue" can resolve the room. Must call next() so commands
     * like /queue still run (nestjs-telegraf does not auto-continue).
     */
    @On('message')
    async onAnyMessage(@Ctx() ctx: Context, @Next() next: () => Promise<void>) {
        try {
            const msg = ctx.message as
                | {
                      via_bot?: { id: number; is_bot?: boolean };
                      from?: { id: number };
                      chat?: { id: number };
                      text?: string;
                      message_thread_id?: number;
                  }
                | undefined;
            if (msg?.from && msg.chat) {
                const chatId = msg.chat.id.toString();
                const threadId = getThreadIdFromMessage(msg);
                const userId = msg.from.id;

                await this.rememberUserLocation(userId, chatId, threadId);

                const pendingConfig = await this.cacheManager.get<{
                    chatId: string;
                    threadId: number | null;
                    key: ConfigKey;
                }>(`config-custom:${userId}`);
                if (pendingConfig && msg.text) {
                    if (msg.text === '/cancel') {
                        await this.cacheManager.delete(
                            `config-custom:${userId}`,
                        );
                        await ctx.reply('Canceled.');
                    } else if (pendingConfig.chatId === chatId) {
                        const field = CONFIG_FIELDS[pendingConfig.key];
                        const errMsg = validateConfigNumber(
                            msg.text,
                            field.type === 'number' ? field.min : 1,
                        );
                        if (errMsg !== '') {
                            await ctx.reply(errMsg);
                        } else {
                            const room =
                                await this.playbackService.getRoomByChatId(
                                    pendingConfig.chatId,
                                    pendingConfig.threadId,
                                );
                            if (room?.Feature) {
                                const value = parseInt(msg.text);
                                await this.playbackService.setFeature(
                                    room.id,
                                    pendingConfig.key,
                                    value,
                                );
                                await this.cacheManager.delete(
                                    `config-custom:${userId}`,
                                );
                                await ctx.reply(
                                    `✅ ${htmlBold(field.label)} set to ${htmlCode(String(value))}`,
                                    { parse_mode: 'HTML' },
                                );
                            }
                        }
                    }
                }

                // Privacy mode may drop via_bot messages; when they do arrive,
                // bind the pending inline result to this chat/topic.
                if (msg.via_bot?.is_bot && msg.via_bot.id === ctx.botInfo?.id) {
                    await this.cacheManager.set(
                        `recent-via:${userId}`,
                        {
                            chatId,
                            threadId,
                            text: msg.text,
                        },
                        60_000,
                    );

                    const pending = await this.cacheManager.get<{
                        inline_message_id: string;
                        videoId: string;
                        text: string;
                    }>(`pending-inline:${userId}`);
                    if (pending?.inline_message_id) {
                        await this.cacheManager.set<InlineChatLocation>(
                            `inline-loc:${pending.inline_message_id}`,
                            { chatId, threadId },
                            SONG_CACHE_TTL,
                        );
                        await this.cacheManager.delete(
                            `pending-inline:${userId}`,
                        );

                        // Hide or refresh Play Next once the room is known.
                        const label = await this.resolvePlayNextLabel(
                            chatId,
                            threadId,
                            userId,
                        );
                        if (label) {
                            await this.cacheManager.set(
                                `playnext-label:${pending.inline_message_id}`,
                                label,
                                SONG_CACHE_TTL,
                            );
                        } else {
                            await this.cacheManager.delete(
                                `playnext-label:${pending.inline_message_id}`,
                            );
                        }
                        await this.safeEdit(() =>
                            ctx.telegram.editMessageReplyMarkup(
                                undefined,
                                undefined,
                                pending.inline_message_id,
                                this.buildSongKeyboard(
                                    label,
                                    userId,
                                    pending.videoId,
                                ).reply_markup,
                            ),
                        );
                    }
                }
            }
        } finally {
            await next();
        }
    }

    private async completeAddToQueue(
        ctx: Context,
        params: {
            videoId: string;
            inlineMessageId: string;
            chatId: string;
            threadId: number | null;
        },
    ) {
        const { videoId, inlineMessageId, chatId, threadId } = params;
        const doneKey = `added:${inlineMessageId}:${videoId}`;
        const lockKey = `adding:${inlineMessageId}:${videoId}`;

        // Already finished by callback or a concurrent path — never overwrite success.
        if (await this.cacheManager.get(doneKey)) return;
        if (await this.cacheManager.get(lockKey)) return;
        await this.cacheManager.set(lockKey, true, 30_000);

        try {
            if (await this.cacheManager.get(doneKey)) return;

            const room = await this.playbackService.getRoomByChatId(
                chatId,
                threadId,
            );
            if (!room) {
                await this.safeEdit(() =>
                    ctx.telegram.editMessageText(
                        undefined,
                        undefined,
                        inlineMessageId,
                        `🚫 No party here—Music Party isn't available in this chat`,
                    ),
                );
                return;
            }

            const roomId = room.id;
            const queueLimit = room.Feature ? room.Feature.maxQueueSize : 10;
            const queues = await this.playbackService.getQueues(roomId);
            if (queues.length >= queueLimit) {
                await ctx.answerCbQuery('Queue is full');
                return;
            }

            const cacheKey = `song:${inlineMessageId}:${videoId}`;
            const cachedSong = await this.cacheManager.get<Song>(cacheKey);
            if (!cachedSong) {
                // Race: primary path already added and cleared cache — stay silent.
                if (await this.cacheManager.get(doneKey)) return;
                if (queues.find((q) => q.url === videoId)) return;

                await this.safeEdit(() =>
                    ctx.telegram.editMessageText(
                        undefined,
                        undefined,
                        inlineMessageId,
                        `🔗 This link has expired. Please try generating a new one.`,
                        {
                            parse_mode: 'HTML',
                        },
                    ),
                );
                return;
            }

            if (queues.find((q) => q.url === videoId)) {
                await this.cacheManager.set(doneKey, true, SONG_CACHE_TTL);
                await this.safeEdit(() =>
                    ctx.telegram.editMessageText(
                        undefined,
                        undefined,
                        inlineMessageId,
                        `🔁 "<i>${cachedSong.name} by ${cachedSong.artist.name}</i>" is already in the queue.`,
                        {
                            parse_mode: 'HTML',
                        },
                    ),
                );
                return;
            }

            const songCombined = `${cachedSong.name} - ${cachedSong.artist.name} [${formatDuration(
                cachedSong.duration || 0,
            )}]`;

            // Analytics is best-effort: a tracking failure must never block a
            // song request. The request ID becomes the queue row ID.
            let requestId: string | undefined;
            try {
                requestId = await this.analyticsService.recordRequest({
                    roomId,
                    requesterId: ctx.from?.id ?? null,
                    videoId,
                    title: cachedSong.name,
                    artist: cachedSong.artist.name,
                    source: 'queue',
                });
            } catch (error) {
                console.error('recordRequest failed', error);
            }

            try {
                await this.playbackService.addToQueue(
                    roomId,
                    videoId,
                    songCombined,
                    requestId,
                );
            } catch (error) {
                if (requestId) {
                    await this.analyticsService
                        .markRequestFailed(requestId)
                        .catch(() => undefined);
                }
                throw error;
            }

            // Mark done before clearing song cache so a concurrent path cannot
            // rewrite the success message as "link expired".
            await this.cacheManager.set(doneKey, true, SONG_CACHE_TTL);
            await ctx.answerCbQuery('Added to Play Next');

            await this.safeEdit(() =>
                ctx.telegram.editMessageText(
                    undefined,
                    undefined,
                    inlineMessageId,
                    `↩️ ${songCombined
                        .split(' - ')
                        .map((v, k) => {
                            if (k === 0) {
                                return `<i>${v}</i>`;
                            }
                            return v;
                        })
                        .join(' - ')} added to the queue.`,
                    {
                        parse_mode: 'HTML',
                    },
                ),
            );

            await this.cacheManager.delete(cacheKey);
            await this.cacheManager.delete(`inline-loc:${inlineMessageId}`);
            this.gateway.addToQueueCommand(
                roomId,
                videoId,
                'end',
                songCombined,
                requestId,
            );
        } finally {
            await this.cacheManager.delete(lockKey);
        }
    }

    private async completePlayNext(
        ctx: Context,
        params: {
            videoId: string;
            inlineMessageId: string;
            chatId: string;
            threadId: number | null;
            userId: number;
        },
    ) {
        const { videoId, inlineMessageId, chatId, threadId, userId } = params;
        const doneKey = `playnext-added:${inlineMessageId}:${videoId}`;
        const lockKey = `playnext-adding:${inlineMessageId}:${videoId}`;

        if (await this.cacheManager.get(doneKey)) return;
        if (await this.cacheManager.get(lockKey)) return;
        await this.cacheManager.set(lockKey, true, 30_000);

        try {
            if (await this.cacheManager.get(doneKey)) return;

            const room = await this.playbackService.getRoomByChatId(
                chatId,
                threadId,
            );
            if (!room) {
                await this.safeEdit(() =>
                    ctx.telegram.editMessageText(
                        undefined,
                        undefined,
                        inlineMessageId,
                        `🚫 No party here—Music Party isn't available in this chat`,
                    ),
                );
                return;
            }

            if (room.Feature?.playNextCommand !== true) {
                await ctx.answerCbQuery('Play Next is disabled in this room');
                return;
            }

            const roomId = room.id;
            const queueLimit = room.Feature ? room.Feature.maxQueueSize : 10;
            const queues = await this.playbackService.getQueues(roomId);
            if (queues.length >= queueLimit) {
                await ctx.answerCbQuery('Queue is full');
                return;
            }

            const cacheKey = `song:${inlineMessageId}:${videoId}`;
            const cachedSong = await this.cacheManager.get<Song>(cacheKey);
            if (!cachedSong) {
                if (await this.cacheManager.get(doneKey)) return;
                if (queues.find((q) => q.url === videoId)) return;

                await this.safeEdit(() =>
                    ctx.telegram.editMessageText(
                        undefined,
                        undefined,
                        inlineMessageId,
                        `🔗 This link has expired. Please try generating a new one.`,
                        {
                            parse_mode: 'HTML',
                        },
                    ),
                );
                return;
            }

            if (queues.find((q) => q.url === videoId)) {
                await this.cacheManager.set(doneKey, true, SONG_CACHE_TTL);
                await ctx.answerCbQuery('This song is already in the queue');
                return;
            }

            const isAdmin = await this.isRoomAdmin(ctx, chatId, userId);
            const dailyLimit = room.Feature.dailyPlayNextLimit;
            const playNextCount = await this.getPlayNextCount(roomId, userId);
            if (!isAdmin && dailyLimit > 0 && playNextCount >= dailyLimit) {
                await ctx.answerCbQuery(
                    `Daily Play Next limit reached (${playNextCount}/${dailyLimit})`,
                );
                return;
            }

            const songCombined = `${cachedSong.name} - ${cachedSong.artist.name} [${formatDuration(
                cachedSong.duration || 0,
            )}]`;

            // Analytics is best-effort; see completeAddToQueue.
            let requestId: string | undefined;
            try {
                requestId = await this.analyticsService.recordRequest({
                    roomId,
                    requesterId: userId,
                    videoId,
                    title: cachedSong.name,
                    artist: cachedSong.artist.name,
                    source: 'play_next',
                });
            } catch (error) {
                console.error('recordRequest failed', error);
            }

            try {
                await this.playbackService.addPlayNext(
                    roomId,
                    videoId,
                    songCombined,
                    requestId,
                );
            } catch (error) {
                if (requestId) {
                    await this.analyticsService
                        .markRequestFailed(requestId)
                        .catch(() => undefined);
                }
                throw error;
            }

            if (!isAdmin) {
                await this.incrementPlayNextCount(roomId, userId);
            }

            await this.cacheManager.set(doneKey, true, SONG_CACHE_TTL);
            await ctx.answerCbQuery('Added to Play Next');

            await this.safeEdit(() =>
                ctx.telegram.editMessageText(
                    undefined,
                    undefined,
                    inlineMessageId,
                    `⏭️ ${songCombined
                        .split(' - ')
                        .map((v, k) => {
                            if (k === 0) {
                                return `<i>${v}</i>`;
                            }
                            return v;
                        })
                        .join(' - ')} will play next.`,
                    {
                        parse_mode: 'HTML',
                    },
                ),
            );

            await this.cacheManager.delete(cacheKey);
            await this.cacheManager.delete(`inline-loc:${inlineMessageId}`);
            this.gateway.addToQueueCommand(
                roomId,
                videoId,
                'next',
                songCombined,
                requestId,
            );
        } finally {
            await this.cacheManager.delete(lockKey);
        }
    }

    @On('edited_message')
    async editedMessage(@Ctx() ctx: Context) {
        // Only seed chat/topic location. Completing the add here races with the
        // queue callback (non-topic groups get edited_message) and can overwrite
        // the success text with "link expired" after the song cache is cleared.
        const inlineKeyboard = ctx.editedMessage?.reply_markup?.inline_keyboard;
        if (!inlineKeyboard || inlineKeyboard?.length === 0) return;

        const buttons = inlineKeyboard[0];
        if (buttons.length === 0) return;

        const addToQueueBtn = buttons[0] as InlineKeyboardButton.CallbackButton;
        if (
            !('callback_data' in addToQueueBtn) ||
            !addToQueueBtn.callback_data.startsWith('verify:')
        ) {
            return;
        }

        const messageInlineID = addToQueueBtn.callback_data.split(':')[3];
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId || !messageInlineID) return;

        await this.cacheManager.set<InlineChatLocation>(
            `inline-loc:${messageInlineID}`,
            { chatId, threadId },
            SONG_CACHE_TTL,
        );
    }

    @Action(/playnext:(.*)/)
    async playNext(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
        const [senderID, videoId] = ctx.match[1].split(':');

        if (!videoId || !senderID) return;

        if (parseInt(senderID) !== ctx.from.id) {
            await ctx.answerCbQuery(
                'You are not allowed to play this song next',
            );
            return;
        }

        const callbackQuery = ctx.update.callback_query;
        const inlineMessageId = callbackQuery.inline_message_id;
        const callbackMessage = callbackQuery.message as
            | {
                  chat?: { id: number };
                  message_thread_id?: number;
              }
            | undefined;

        let chatId = callbackMessage?.chat?.id?.toString() || '';
        let threadId = getThreadIdFromMessage(callbackMessage);

        if (inlineMessageId) {
            const loc = await this.cacheManager.get<InlineChatLocation>(
                `inline-loc:${inlineMessageId}`,
            );
            if (loc) {
                chatId = loc.chatId;
                threadId = loc.threadId;
            }
        }

        if (!chatId) {
            const recent = await this.cacheManager.get<
                InlineChatLocation & { text?: string }
            >(`recent-via:${ctx.from.id}`);
            if (recent?.chatId) {
                chatId = recent.chatId;
                threadId = recent.threadId;
            }
        }

        if (!chatId) {
            const userLoc = await this.cacheManager.get<InlineChatLocation>(
                `user-loc:${ctx.from.id}`,
            );
            if (userLoc?.chatId) {
                chatId = userLoc.chatId;
                threadId = userLoc.threadId;
            }
        }

        if (!inlineMessageId) {
            await ctx.answerCbQuery('Missing message id');
            return;
        }

        if (!chatId) {
            await ctx.answerCbQuery(
                'Open the topic and run /queue once, then try again',
            );
            await this.safeEdit(() =>
                ctx.editMessageText(
                    `🚫 Could not detect this topic. Run /queue (or any command) in the topic, then add the song again.`,
                ),
            );
            return;
        }

        await this.completePlayNext(ctx, {
            videoId,
            inlineMessageId,
            chatId,
            threadId,
            userId: ctx.from.id,
        });
    }

    @Action(/queue:(.*)/)
    async addToQueue(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
        const [senderID, videoId] = ctx.match[1].split(':');

        if (!videoId || !senderID) return;

        if (parseInt(senderID) !== ctx.from.id) {
            await ctx.answerCbQuery('You are not allowed to add this song');
            return;
        }

        const callbackQuery = ctx.update.callback_query;
        const inlineMessageId = callbackQuery.inline_message_id;
        const callbackMessage = callbackQuery.message as
            | {
                  chat?: { id: number };
                  message_thread_id?: number;
              }
            | undefined;

        let chatId = callbackMessage?.chat?.id?.toString() || '';
        let threadId = getThreadIdFromMessage(callbackMessage);

        if (inlineMessageId) {
            const loc = await this.cacheManager.get<InlineChatLocation>(
                `inline-loc:${inlineMessageId}`,
            );
            if (loc) {
                chatId = loc.chatId;
                threadId = loc.threadId;
            }
        }

        if (!chatId) {
            const recent = await this.cacheManager.get<
                InlineChatLocation & { text?: string }
            >(`recent-via:${ctx.from.id}`);
            if (recent?.chatId) {
                chatId = recent.chatId;
                threadId = recent.threadId;
            }
        }

        // User's last chat/topic from any prior command/message in that room
        if (!chatId) {
            const userLoc = await this.cacheManager.get<InlineChatLocation>(
                `user-loc:${ctx.from.id}`,
            );
            if (userLoc?.chatId) {
                chatId = userLoc.chatId;
                threadId = userLoc.threadId;
            }
        }

        if (!inlineMessageId) {
            await ctx.answerCbQuery('Missing message id');
            return;
        }

        if (!chatId) {
            await ctx.answerCbQuery(
                'Open the topic and run /queue once, then try again',
            );
            await this.safeEdit(() =>
                ctx.editMessageText(
                    `🚫 Could not detect this topic. Run /queue (or any command) in the topic, then add the song again.`,
                ),
            );
            return;
        }

        await ctx.answerCbQuery('Adding to queue...');

        try {
            await ctx.editMessageReplyMarkup({
                inline_keyboard: [
                    [
                        Markup.button.callback(
                            `Verifying..`,
                            `verify:${senderID}:${videoId}:${inlineMessageId}`,
                        ),
                    ],
                ],
            });
        } catch {
            // Markup may already be verifying or message gone; still add to queue.
        }

        await this.completeAddToQueue(ctx, {
            videoId,
            inlineMessageId,
            chatId,
            threadId,
        });
    }

    @Action(/cancel:(.*)/)
    async cancelQueue(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
        const [senderID] = ctx.match[1].split(':');

        if (!senderID) return;

        if (parseInt(senderID) !== ctx.from.id) {
            await ctx.answerCbQuery('You are not allowed to add this song');
            return;
        }

        await ctx.answerCbQuery('Canceling...');
        await this.safeEdit(() => ctx.editMessageText('❌ Canceled.'));
    }

    @Action(/verify:(.*)/)
    async verify(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
        const [senderID] = ctx.match[1].split(':');

        if (!senderID) return;

        if (parseInt(senderID) !== ctx.from.id) {
            await ctx.answerCbQuery('You are not allowed to do this action');
            return;
        }

        await ctx.answerCbQuery('Sabar...');
    }

    @Command('queue')
    async getQueues(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        const threadId = getThreadId(ctx);
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        await this.rememberUserLocation(ctx.from?.id, chatId, threadId);

        const room = await this.playbackService.getRoomByChatId(
            chatId,
            threadId,
        );
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;
        const result = await this.gateway.getPlayerQueue(roomId);
        if (result.status !== 'ok') {
            await ctx.reply(
                result.status === 'offline'
                    ? 'No player connected. Open YouTube Music and join this room.'
                    : result.status === 'timeout'
                      ? 'The player did not respond. Try again shortly, and make sure your extension is up to date.'
                      : 'The YouTube Music queue is not available yet. Try again shortly.',
            );
            return;
        }
        const data = result.items;
        const requests = await this.playbackService.getQueues(roomId);

        if (data.length === 0 && requests.length === 0) {
            await ctx.reply(
                [
                    `🎧 ${htmlBold('YouTube Music queue is empty')}`,
                    htmlItalic('Search with the bot inline to add songs.'),
                ].join('\n'),
                { parse_mode: 'HTML' },
            );
            return;
        }

        const currentIndex = data.findIndex((item) => item.current);
        const upcoming =
            currentIndex >= 0 ? data.slice(currentIndex + 1) : data;
        const requestedIds = new Set(requests.map((item) => item.url));
        const userQueue = upcoming.filter((item) => requestedIds.has(item.url));
        for (const request of requests) {
            if (!data.some((item) => item.url === request.url)) {
                userQueue.push({ ...request, artist: '', current: false });
            }
        }
        const autoplay = upcoming.filter((item) => !requestedIds.has(item.url));
        const formatTrack = (item: { title: string; artist: string }) =>
            `${escapeHtml(item.title.slice(0, 120) || 'Unknown track')}${item.artist ? ` — ${escapeHtml(item.artist.slice(0, 80))}` : ''}`;
        const lines = [`🎧 ${htmlBold('YouTube Music queue')}`];
        if (currentIndex >= 0)
            lines.push('', `▶ ${formatTrack(data[currentIndex])}`);
        // Reserve a separate budget for autoplay so requests cannot hide its preview.
        const appendSection = (
            label: string,
            items: { title: string; artist: string }[],
            limit: number,
            budget: number,
        ) => {
            lines.push('', htmlBold(label));
            if (!items.length) lines.push('No upcoming tracks.');
            let shown = 0;
            let length = 0;
            for (const item of items.slice(0, limit)) {
                const line = `${shown + 1}. ${formatTrack(item)}`;
                if (length + line.length > budget) break;
                lines.push(line);
                length += line.length + 1;
                shown++;
            }
            if (shown < items.length)
                lines.push(`… ${items.length - shown} more tracks.`);
        };
        appendSection('User requests', userQueue, userQueue.length, 1800);
        appendSection('Player / autoplay', autoplay, 5, 1200);
        await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    }
}
