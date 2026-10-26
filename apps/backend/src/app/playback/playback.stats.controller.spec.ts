import type { Context } from 'telegraf';
import { PlaybackStatsController } from './playback.stats.controller';
import type { PlaybackService } from './playback.service';
import type { AnalyticsService } from 'src/app/analytics/analytics.service';

const overview = (label = 'Today') => ({
    label,
    from: new Date('2026-10-26T00:00:00Z'),
    coverageStart: new Date('2026-10-01T00:00:00Z'),
    requests: 3,
    failedRequests: 0,
    requesters: 2,
    started: 3,
    qualified: 2,
    completed: 1,
    skipped: 0,
    incomplete: 0,
    uniqueTracks: 3,
    listenedMs: 65_000,
});

function makeCtx(
    text: string,
    options: {
        chatId?: number;
        threadId?: number | null;
        userId?: number;
    } = {},
) {
    const { chatId = -100, threadId = 7, userId = 55 } = options;
    const message: Record<string, unknown> = { text };
    if (threadId !== null) message.message_thread_id = threadId;
    const ctx = {
        chat: { id: chatId, type: 'supergroup' },
        from: { id: userId, first_name: 'Ana' },
        message,
        msg: message,
        reply: jest.fn().mockResolvedValue(undefined),
    };
    return ctx as unknown as Context & { reply: jest.Mock };
}

function makeController() {
    const playbackService = {
        getRoomByChatId: jest.fn(),
    };
    const analyticsService = {
        getRoomOverview: jest.fn(),
        getTopRequestedSongs: jest.fn().mockResolvedValue([]),
        getTopPlayedSongs: jest.fn().mockResolvedValue([]),
        getTopArtists: jest.fn().mockResolvedValue([]),
        getTopRequesters: jest.fn().mockResolvedValue([]),
        getRecentPlaybacks: jest.fn().mockResolvedValue([]),
        getRequesterOverview: jest.fn().mockResolvedValue({
            requests: 0,
            uniqueTracks: 0,
            started: 0,
            qualified: 0,
            completed: 0,
            listenedMs: 0,
        }),
    };
    const controller = new PlaybackStatsController(
        playbackService as unknown as PlaybackService,
        analyticsService as unknown as AnalyticsService,
    );
    return { controller, playbackService, analyticsService };
}

describe('PlaybackStatsController room and topic isolation', () => {
    it('resolves the room from the chat and forum topic', async () => {
        const { controller, playbackService, analyticsService } =
            makeController();
        playbackService.getRoomByChatId.mockImplementation(
            (chatId: string, threadId: number | null) => ({
                id: `room-${threadId ?? 'root'}`,
                chatId,
            }),
        );
        analyticsService.getRoomOverview.mockResolvedValue(overview());

        const ctx = makeCtx('/stats', { threadId: 12 });
        await controller.stats(ctx);

        expect(playbackService.getRoomByChatId).toHaveBeenCalledWith(
            '-100',
            12,
        );
        expect(analyticsService.getRoomOverview).toHaveBeenCalledWith(
            'room-12',
            'today',
        );
        expect(analyticsService.getTopPlayedSongs).toHaveBeenCalledWith(
            'room-12',
            'today',
            3,
        );
    });

    it('keeps separate topics on separate rooms', async () => {
        const { controller, playbackService, analyticsService } =
            makeController();
        playbackService.getRoomByChatId.mockImplementation(
            (_chatId: string, threadId: number | null) => ({
                id: `room-${threadId ?? 'root'}`,
            }),
        );
        analyticsService.getRoomOverview.mockResolvedValue(overview());

        await controller.stats(makeCtx('/stats', { threadId: 1 }));
        await controller.stats(makeCtx('/stats', { threadId: 2 }));

        expect(
            analyticsService.getRoomOverview.mock.calls.map(
                (call) => (call as unknown[])[0],
            ),
        ).toEqual(['room-1', 'room-2']);
    });

    it('scopes personal stats to the current room and Telegram user', async () => {
        const { controller, playbackService, analyticsService } =
            makeController();
        playbackService.getRoomByChatId.mockResolvedValue({ id: 'room-9' });

        await controller.mystats(makeCtx('/mystats month', { userId: 77 }));

        expect(analyticsService.getRequesterOverview).toHaveBeenCalledWith(
            'room-9',
            '77',
            'month',
        );
    });
});

describe('PlaybackStatsController commands', () => {
    it('ranks played songs for /top songs', async () => {
        const { controller, playbackService, analyticsService } =
            makeController();
        playbackService.getRoomByChatId.mockResolvedValue({ id: 'room-1' });

        await controller.top(makeCtx('/top songs week'));

        expect(analyticsService.getTopPlayedSongs).toHaveBeenCalledWith(
            'room-1',
            'week',
            5,
        );
        expect(analyticsService.getTopArtists).not.toHaveBeenCalled();
    });

    it('ranks requested songs for /top requested', async () => {
        const { controller, playbackService, analyticsService } =
            makeController();
        playbackService.getRoomByChatId.mockResolvedValue({ id: 'room-1' });

        await controller.top(makeCtx('/top requested all'));

        expect(analyticsService.getTopRequestedSongs).toHaveBeenCalledWith(
            'room-1',
            'all',
            5,
        );
    });

    it('ranks display artists for /top artists', async () => {
        const { controller, playbackService, analyticsService } =
            makeController();
        playbackService.getRoomByChatId.mockResolvedValue({ id: 'room-1' });

        await controller.top(makeCtx('/top artists month'));

        expect(analyticsService.getTopArtists).toHaveBeenCalledWith(
            'room-1',
            'month',
            5,
        );
    });

    it('rejects an unknown period without querying analytics', async () => {
        const { controller, playbackService, analyticsService } =
            makeController();
        playbackService.getRoomByChatId.mockResolvedValue({ id: 'room-1' });

        const ctx = makeCtx('/stats year');
        await controller.stats(ctx);

        expect(ctx.reply).toHaveBeenCalledWith(
            expect.stringContaining('Unknown period'),
            { parse_mode: 'HTML' },
        );
        expect(analyticsService.getRoomOverview).not.toHaveBeenCalled();
    });

    it('reports history for the room', async () => {
        const { controller, playbackService, analyticsService } =
            makeController();
        playbackService.getRoomByChatId.mockResolvedValue({ id: 'room-1' });

        await controller.history(makeCtx('/history today'));

        expect(analyticsService.getRecentPlaybacks).toHaveBeenCalledWith(
            'room-1',
            'today',
            10,
        );
    });
});
