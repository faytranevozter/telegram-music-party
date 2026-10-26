import { Command, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { PlaybackService } from './playback.service';
import {
    AnalyticsService,
    type RecentPlayback,
    type RequesterStats,
    type TopArtist,
    type TopSong,
} from 'src/app/analytics/analytics.service';
import {
    escapeHtml,
    formatDateTime,
    formatDuration,
    htmlBold,
    htmlCode,
    htmlItalic,
} from 'src/helpers/util';
import {
    parseStatsPeriod,
    resolvePeriod,
    STATS_PERIODS,
    type StatsPeriod,
} from 'src/app/analytics/analytics.util';

const getThreadId = (ctx: Context): number | null => {
    const msg = (ctx.msg ?? ctx.editedMessage) as
        | { message_thread_id?: number }
        | undefined
        | null;
    return msg && typeof msg.message_thread_id === 'number'
        ? msg.message_thread_id
        : null;
};

const PERIOD_USAGE = STATS_PERIODS.join(' | ');

const truncate = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value;

const formatTrack = (title: string, artist: string) => {
    const name = escapeHtml(truncate(title || 'Unknown track', 60));
    const by = artist ? ` — ${escapeHtml(truncate(artist, 40))}` : '';
    return `${name}${by}`;
};

const formatListeningTime = (listenedMs: number) =>
    formatDuration(Math.round(listenedMs / 1000));

const formatRequester = (requesterId: string) => {
    const id = requesterId.replace(/[^0-9-]/g, '');
    if (!id) return 'unknown';
    return `<a href="tg://user?id=${id}">User ${id}</a>`;
};

const formatSongRows = (rows: TopSong[]) =>
    rows.length === 0
        ? ['No data yet.']
        : rows.map(
              (row, index) =>
                  `${index + 1}. ${formatTrack(row.title, row.artist)} · ${row.count}`,
          );

const formatArtistRows = (rows: TopArtist[]) =>
    rows.length === 0
        ? ['No data yet.']
        : rows.map(
              (row, index) =>
                  `${index + 1}. ${escapeHtml(truncate(row.artist, 60))} · ${row.plays}`,
          );

const formatRequesterRows = (rows: RequesterStats[]) =>
    rows.length === 0
        ? ['No data yet.']
        : rows.map(
              (row, index) =>
                  `${index + 1}. ${formatRequester(row.requesterId)} · ${row.requests} requests · ${row.uniqueTracks} tracks`,
          );

const formatHistoryRow = (row: RecentPlayback, index: number) => {
    const status = row.completed
        ? '✅ completed'
        : row.endReason === 'skipped'
          ? '⏭️ skipped'
          : row.status === 'incomplete' || row.endReason === 'interrupted'
            ? '⚠️ incomplete'
            : row.qualified
              ? '▶️ played'
              : '⏱️ short play';
    const by = row.requesterId
        ? ` · by ${formatRequester(row.requesterId)}`
        : '';
    return [
        `${index + 1}. ${formatTrack(row.title, row.artist)} · ${status}`,
        `   ${formatListeningTime(row.listenedMs)} listened · ${escapeHtml(row.source)} · ${escapeHtml(formatDateTime(row.startedAt))}${by}`,
    ].join('\n');
};

/**
 * Room-scoped analytics commands. Every summary defaults to the chat/topic
 * room; there are no cross-room user profiles.
 */
@Update()
export class PlaybackStatsController {
    constructor(
        private readonly playbackService: PlaybackService,
        private readonly analyticsService: AnalyticsService,
    ) {}

    private getArgs(ctx: Context): string[] {
        const text =
            (ctx.message as { text?: string } | undefined)?.text ??
            (ctx.editedMessage as { text?: string } | undefined)?.text ??
            '';
        return text.trim().split(/\s+/).slice(1);
    }

    private async getRoom(ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) return null;
        return this.playbackService.getRoomByChatId(chatId, getThreadId(ctx));
    }

    private async parsePeriodArg(
        ctx: Context,
        arg: string | undefined,
        fallback: StatsPeriod,
    ): Promise<StatsPeriod | null> {
        if (!arg) return fallback;
        const period = parseStatsPeriod(arg);
        if (!period) {
            await ctx.reply(
                `Unknown period ${htmlCode(arg)}. Use one of: ${PERIOD_USAGE}.`,
                { parse_mode: 'HTML' },
            );
            return null;
        }
        return period;
    }

    private buildTrackingSince(coverageStart: Date | null) {
        return coverageStart
            ? htmlItalic(`Tracking since ${formatDateTime(coverageStart)}`)
            : htmlItalic(
                  'Tracking starts with the first request after rollout.',
              );
    }

    @Command('stats')
    async stats(@Ctx() ctx: Context) {
        const room = await this.getRoom(ctx);
        if (!room) {
            await ctx.reply('No room found. Use /register first.');
            return;
        }

        const args = this.getArgs(ctx);
        const period = await this.parsePeriodArg(ctx, args[0], 'today');
        if (!period) return;

        const [overview, topRequested, topPlayed, topArtists, topRequesters] =
            await Promise.all([
                this.analyticsService.getRoomOverview(room.id, period),
                this.analyticsService.getTopRequestedSongs(room.id, period, 3),
                this.analyticsService.getTopPlayedSongs(room.id, period, 3),
                this.analyticsService.getTopArtists(room.id, period, 3),
                this.analyticsService.getTopRequesters(room.id, period, 3),
            ]);

        const lines = [
            `📊 ${htmlBold(`Room stats — ${overview.label}`)}`,
            this.buildTrackingSince(overview.coverageStart),
            '',
            htmlBold('Overview'),
            `${overview.requests} requests · ${overview.requesters} requesters · ${overview.uniqueTracks} unique tracks`,
            ...(overview.failedRequests > 0
                ? [`${overview.failedRequests} failed requests`]
                : []),
            `${overview.started} starts · ${overview.qualified} qualified plays · ${overview.completed} completed`,
            `${overview.skipped} skipped · ${overview.incomplete} incomplete`,
            `Observed playback time: ${formatListeningTime(overview.listenedMs)}`,
            '',
            htmlBold('Top requested'),
            ...formatSongRows(topRequested),
            '',
            htmlBold('Top played (qualified plays)'),
            ...formatSongRows(topPlayed),
            '',
            htmlBold('Top artists (display names)'),
            ...formatArtistRows(topArtists),
            '',
            htmlBold('Top requesters'),
            ...formatRequesterRows(topRequesters),
        ];

        await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    }

    @Command('top')
    async top(@Ctx() ctx: Context) {
        const room = await this.getRoom(ctx);
        if (!room) {
            await ctx.reply('No room found. Use /register first.');
            return;
        }

        const args = this.getArgs(ctx);
        let type: 'songs' | 'requested' | 'artists' = 'songs';
        let period: StatsPeriod = 'today';
        for (const arg of args) {
            const parsedPeriod = parseStatsPeriod(arg);
            if (parsedPeriod) {
                period = parsedPeriod;
                continue;
            }
            if (arg === 'songs' || arg === 'requested' || arg === 'artists') {
                type = arg;
                continue;
            }
            await ctx.reply(
                `Usage: /top [songs|requested|artists] [${PERIOD_USAGE}]\nExample: /top requested week`,
            );
            return;
        }

        const label =
            type === 'songs'
                ? 'Top played songs'
                : type === 'requested'
                  ? 'Top requested songs'
                  : 'Top artists';
        const { label: periodLabel } = resolvePeriod(period);
        const lines =
            type === 'songs'
                ? formatSongRows(
                      await this.analyticsService.getTopPlayedSongs(
                          room.id,
                          period,
                          5,
                      ),
                  )
                : type === 'requested'
                  ? formatSongRows(
                        await this.analyticsService.getTopRequestedSongs(
                            room.id,
                            period,
                            5,
                        ),
                    )
                  : formatArtistRows(
                        await this.analyticsService.getTopArtists(
                            room.id,
                            period,
                            5,
                        ),
                    );

        await ctx.reply(
            [
                `🏆 ${htmlBold(`${label} — ${periodLabel}`)}`,
                htmlItalic(
                    type === 'songs'
                        ? 'Ranked by qualified plays.'
                        : type === 'requested'
                          ? 'Ranked by accepted bot requests.'
                          : 'Grouped by the displayed artist text.',
                ),
                '',
                ...lines,
            ].join('\n'),
            { parse_mode: 'HTML' },
        );
    }

    @Command('history')
    async history(@Ctx() ctx: Context) {
        const room = await this.getRoom(ctx);
        if (!room) {
            await ctx.reply('No room found. Use /register first.');
            return;
        }

        const args = this.getArgs(ctx);
        const period = await this.parsePeriodArg(ctx, args[0], 'all');
        if (!period) return;

        const rows = await this.analyticsService.getRecentPlaybacks(
            room.id,
            period,
            10,
        );
        if (rows.length === 0) {
            await ctx.reply(
                [
                    `📜 ${htmlBold('Playback history')}`,
                    htmlItalic('No playbacks recorded yet.'),
                ].join('\n'),
                { parse_mode: 'HTML' },
            );
            return;
        }

        await ctx.reply(
            [
                `📜 ${htmlBold('Recent playbacks')}`,
                htmlItalic('Newest first · times use the server timezone.'),
                '',
                rows.map(formatHistoryRow).join('\n\n'),
            ].join('\n'),
            { parse_mode: 'HTML' },
        );
    }

    @Command('mystats')
    async mystats(@Ctx() ctx: Context) {
        const room = await this.getRoom(ctx);
        if (!room) {
            await ctx.reply('No room found. Use /register first.');
            return;
        }

        const userId = ctx.from?.id;
        if (!userId) {
            await ctx.reply('Could not identify your Telegram account.');
            return;
        }

        const args = this.getArgs(ctx);
        const period = await this.parsePeriodArg(ctx, args[0], 'all');
        if (!period) return;

        const overview = await this.analyticsService.getRequesterOverview(
            room.id,
            String(userId),
            period,
        );
        const name = ctx.from?.first_name
            ? escapeHtml(ctx.from.first_name)
            : 'You';
        const { label } = resolvePeriod(period);

        await ctx.reply(
            [
                `👤 ${htmlBold(`${name} — ${label}`)}`,
                '',
                `${overview.requests} requests · ${overview.uniqueTracks} unique tracks`,
                `${overview.started} started · ${overview.qualified} qualified plays · ${overview.completed} completed`,
                `Observed playback time: ${formatListeningTime(overview.listenedMs)}`,
                '',
                htmlItalic(
                    'Only songs requested through the bot in this room are attributed to you.',
                ),
            ].join('\n'),
            { parse_mode: 'HTML' },
        );
    }
}
