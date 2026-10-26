import { AnalyticsService } from './analytics.service';
import type { PrismaService } from 'src/platform/prisma.service';
import type { PlaybackReport } from 'src/types/analytics.type';

type PrismaMock = {
    playbackSession: {
        findUnique: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
        deleteMany: jest.Mock;
    };
    songRequest: {
        findFirst: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
        deleteMany: jest.Mock;
    };
};

type CallArgs = {
    where?: Record<string, unknown>;
    data?: Record<string, unknown>;
};

const firstCall = (mock: jest.Mock): CallArgs =>
    (mock.mock.calls as unknown[][])[0]?.[0] as CallArgs;

const report = (overrides: Partial<PlaybackReport> = {}): PlaybackReport => ({
    roomId: 'room-1',
    playbackId: 'playback-1',
    videoId: 'video-1',
    requestId: null,
    title: 'Song',
    artist: 'Artist',
    durationMs: 200_000,
    source: 'unknown',
    event: 'start',
    startedAt: new Date().toISOString(),
    endedAt: null,
    listenedMs: 0,
    endReason: null,
    ...overrides,
});

describe('AnalyticsService playback recording', () => {
    let prisma: PrismaMock;
    let service: AnalyticsService;

    const existingSession = (overrides: Record<string, unknown> = {}) => ({
        id: 'playback-1',
        requestId: null,
        title: 'Song',
        artist: 'Artist',
        durationMs: 200_000,
        source: 'autoplay',
        endReason: null,
        endedAt: null,
        status: 'open',
        listenedMs: 0,
        qualified: false,
        completed: false,
        ...overrides,
    });

    beforeEach(() => {
        prisma = {
            playbackSession: {
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue(undefined),
                update: jest.fn().mockResolvedValue(undefined),
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            songRequest: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({ id: 'request-1' }),
                update: jest.fn().mockResolvedValue(undefined),
                updateMany: jest.fn().mockResolvedValue({ count: 0 }),
                deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
        };
        service = new AnalyticsService(prisma as unknown as PrismaService);
    });

    it('creates one session per playback ID', async () => {
        await service.recordPlayback(report());

        expect(firstCall(prisma.playbackSession.create).data).toMatchObject({
            id: 'playback-1',
            roomId: 'room-1',
            videoId: 'video-1',
            status: 'open',
            qualified: false,
            completed: false,
        });
    });

    it('deduplicates a retried start instead of resetting progress', async () => {
        prisma.playbackSession.findUnique.mockResolvedValue(
            existingSession({ listenedMs: 45_000, qualified: true }),
        );

        await service.recordPlayback(report({ listenedMs: 0, event: 'start' }));

        expect(prisma.playbackSession.create).not.toHaveBeenCalled();
        expect(firstCall(prisma.playbackSession.update).data).toMatchObject({
            listenedMs: 45_000,
            qualified: true,
            status: 'open',
        });
    });

    it('does not count an interrupted near-complete session as completed', async () => {
        await service.recordPlayback(
            report({
                event: 'end',
                endReason: 'interrupted',
                listenedMs: 195_000,
                durationMs: 200_000,
            }),
        );

        expect(firstCall(prisma.playbackSession.create).data).toMatchObject({
            qualified: true,
            completed: false,
            status: 'incomplete',
            endReason: 'interrupted',
        });
    });

    it('counts a completed end past the 90% threshold', async () => {
        await service.recordPlayback(
            report({
                event: 'end',
                endReason: 'completed',
                listenedMs: 185_000,
                durationMs: 200_000,
            }),
        );

        expect(firstCall(prisma.playbackSession.create).data).toMatchObject({
            qualified: true,
            completed: true,
            status: 'closed',
            endReason: 'completed',
        });
    });

    it('never lowers observed listening time on out-of-order retries', async () => {
        prisma.playbackSession.findUnique.mockResolvedValue(
            existingSession({
                listenedMs: 60_000,
                qualified: true,
                source: 'manual',
            }),
        );

        await service.recordPlayback(
            report({ listenedMs: 20_000, event: 'progress' }),
        );

        expect(firstCall(prisma.playbackSession.update).data?.listenedMs).toBe(
            60_000,
        );
    });

    it('keeps the first definitive end when a stale report arrives late', async () => {
        const endedAt = new Date();
        prisma.playbackSession.findUnique.mockResolvedValue(
            existingSession({
                endReason: 'completed',
                endedAt,
                status: 'closed',
                listenedMs: 190_000,
                qualified: true,
                completed: true,
            }),
        );

        await service.recordPlayback(
            report({
                listenedMs: 195_000,
                event: 'end',
                endReason: 'skipped',
            }),
        );

        expect(firstCall(prisma.playbackSession.update).data).toMatchObject({
            endReason: 'completed',
            endedAt,
            status: 'closed',
            listenedMs: 195_000,
        });
    });

    it('reopens an interrupted session when the device reconnects', async () => {
        prisma.playbackSession.findUnique.mockResolvedValue(
            existingSession({
                endReason: 'interrupted',
                endedAt: new Date(),
                status: 'incomplete',
                listenedMs: 10_000,
                source: 'manual',
            }),
        );

        await service.recordPlayback(
            report({ listenedMs: 40_000, event: 'progress' }),
        );

        expect(firstCall(prisma.playbackSession.update).data).toMatchObject({
            listenedMs: 40_000,
            qualified: true,
            endReason: null,
            endedAt: null,
            status: 'open',
        });
    });

    it('ignores request correlations that do not belong to the room and track', async () => {
        await service.recordPlayback(
            report({ requestId: 'request-from-another-room' }),
        );

        const where = firstCall(prisma.songRequest.findFirst).where;
        expect(where).toEqual({
            id: 'request-from-another-room',
            roomId: 'room-1',
            videoId: 'video-1',
        });
        expect(firstCall(prisma.playbackSession.create).data?.requestId).toBe(
            null,
        );
    });

    it('records autoplay plays without a requester', async () => {
        await service.recordPlayback(
            report({
                source: 'autoplay',
                event: 'end',
                endReason: 'completed',
            }),
        );

        expect(prisma.songRequest.findFirst).not.toHaveBeenCalled();
        expect(firstCall(prisma.playbackSession.create).data).toMatchObject({
            requestId: null,
            source: 'autoplay',
            endReason: 'completed',
            status: 'closed',
        });
    });

    it('advances the request outcome only for correlated playback', async () => {
        prisma.songRequest.findFirst.mockResolvedValue({
            id: 'request-1',
            outcome: 'queued',
        });

        await service.recordPlayback(report({ requestId: 'request-1' }));

        expect(firstCall(prisma.songRequest.update).data).toEqual({
            outcome: 'started',
        });
    });

    it('marks stale open sessions incomplete without inventing an end', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-10-26T12:00:00Z'));
        const updateMany = jest.fn().mockResolvedValue({ count: 1 });
        const service = new AnalyticsService({
            playbackSession: { updateMany },
        } as unknown as PrismaService);

        await service.finalizeStaleSessions('room-1');

        expect(firstCall(updateMany).where).toEqual({
            roomId: 'room-1',
            status: 'open',
            updatedAt: {
                lt: new Date('2026-10-26T11:58:00Z'),
            },
        });
        expect(firstCall(updateMany).data).toEqual({
            status: 'incomplete',
            endReason: 'interrupted',
        });
        jest.useRealTimers();
    });

    it('closes only open sessions in the room when the device leaves', async () => {
        await service.closeRoomSessions('room-1', 'interrupted');

        const call = firstCall(prisma.playbackSession.updateMany);
        expect(call.where).toEqual({ roomId: 'room-1', status: 'open' });
        expect(call.data?.endReason).toBe('interrupted');
        expect(call.data?.status).toBe('incomplete');
        expect(call.data?.endedAt).toBeInstanceOf(Date);
    });
});

describe('AnalyticsService request history', () => {
    it('keeps repeated requests of the same song as separate records', async () => {
        const create = jest
            .fn()
            .mockResolvedValueOnce({ id: 'request-1' })
            .mockResolvedValueOnce({ id: 'request-2' });
        const service = new AnalyticsService({
            songRequest: { create },
        } as unknown as PrismaService);

        const first = await service.recordRequest({
            roomId: 'room-1',
            requesterId: 7,
            videoId: 'video-1',
            title: 'Song',
            artist: 'Artist',
            source: 'queue',
        });
        const second = await service.recordRequest({
            roomId: 'room-1',
            requesterId: 8,
            videoId: 'video-1',
            title: 'Song',
            artist: 'Artist',
            source: 'play_next',
        });

        expect([first, second]).toEqual(['request-1', 'request-2']);
        expect(create).toHaveBeenCalledTimes(2);
        expect(
            (create.mock.calls as unknown[][]).map(
                (call) => (call[0] as { data: { videoId: string } }).data,
            ),
        ).toEqual([
            expect.objectContaining({ videoId: 'video-1', source: 'queue' }),
            expect.objectContaining({
                videoId: 'video-1',
                source: 'play_next',
            }),
        ]);
    });

    it('marks a request failed instead of counting it as requested', async () => {
        const updateMany = jest.fn().mockResolvedValue({ count: 1 });
        const service = new AnalyticsService({
            songRequest: { updateMany },
        } as unknown as PrismaService);

        await service.markRequestFailed('request-1');

        expect(firstCall(updateMany).where).toEqual({
            id: 'request-1',
            outcome: 'queued',
        });
        expect(firstCall(updateMany).data).toEqual({ outcome: 'failed' });
    });
});

describe('AnalyticsService room scoping', () => {
    it('filters played-song rankings to one room', async () => {
        const groupBy = jest.fn().mockResolvedValue([]);
        const findMany = jest.fn().mockResolvedValue([]);
        const service = new AnalyticsService({
            playbackSession: { groupBy, findMany },
        } as unknown as PrismaService);

        await service.getTopPlayedSongs('room-a', 'today');

        expect(firstCall(groupBy).where).toMatchObject({
            roomId: 'room-a',
            qualified: true,
        });
        expect(firstCall(findMany).where).toMatchObject({
            roomId: 'room-a',
            qualified: true,
        });
    });

    it('filters requested-song rankings to one room', async () => {
        const groupBy = jest.fn().mockResolvedValue([]);
        const findMany = jest.fn().mockResolvedValue([]);
        const service = new AnalyticsService({
            songRequest: { groupBy, findMany },
        } as unknown as PrismaService);

        await service.getTopRequestedSongs('room-a', 'all');

        expect(firstCall(groupBy).where).toMatchObject({
            roomId: 'room-a',
            outcome: { not: 'failed' },
        });
    });

    it('filters recent playbacks to one room', async () => {
        const updateMany = jest.fn().mockResolvedValue({ count: 0 });
        const findMany = jest.fn().mockResolvedValue([]);
        const service = new AnalyticsService({
            playbackSession: { updateMany, findMany },
        } as unknown as PrismaService);

        await service.getRecentPlaybacks('room-b', 'all');

        expect(firstCall(updateMany).where).toMatchObject({
            roomId: 'room-b',
        });
        expect(firstCall(findMany).where).toMatchObject({
            roomId: 'room-b',
        });
    });

    it('reports coverage from the earliest request or playback in the room', async () => {
        const requestDate = new Date('2026-10-20T10:00:00Z');
        const sessionDate = new Date('2026-10-19T09:00:00Z');
        const service = new AnalyticsService({
            songRequest: {
                aggregate: jest
                    .fn()
                    .mockResolvedValue({ _min: { requestedAt: requestDate } }),
            },
            playbackSession: {
                aggregate: jest
                    .fn()
                    .mockResolvedValue({ _min: { startedAt: sessionDate } }),
            },
        } as unknown as PrismaService);

        expect(await service.getCoverageStart('room-a')).toEqual(sessionDate);
    });

    it('returns no coverage for a room without events', async () => {
        const service = new AnalyticsService({
            songRequest: {
                aggregate: jest
                    .fn()
                    .mockResolvedValue({ _min: { requestedAt: null } }),
            },
            playbackSession: {
                aggregate: jest
                    .fn()
                    .mockResolvedValue({ _min: { startedAt: null } }),
            },
        } as unknown as PrismaService);

        expect(await service.getCoverageStart('room-a')).toBeNull();
    });
});

describe('AnalyticsService retention', () => {
    it('prunes raw events past the configured window', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-10-26T00:00:00Z'));
        const prisma = {
            playbackSession: {
                deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
            },
            songRequest: {
                deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
            },
        };
        const service = new AnalyticsService(
            prisma as unknown as PrismaService,
        );

        const result = await service.purgeExpiredAnalytics(30);

        const cutoff = new Date('2026-09-26T00:00:00Z');
        expect(firstCall(prisma.playbackSession.deleteMany).where).toEqual({
            startedAt: { lt: cutoff },
        });
        expect(firstCall(prisma.songRequest.deleteMany).where).toEqual({
            requestedAt: { lt: cutoff },
            PlaybackSessions: { none: { startedAt: { gte: cutoff } } },
        });
        expect(result).toEqual({ requests: 3, sessions: 2 });
        jest.useRealTimers();
    });

    it('does nothing when pruning is disabled', async () => {
        const prisma = {
            playbackSession: { deleteMany: jest.fn() },
            songRequest: { deleteMany: jest.fn() },
        };
        const service = new AnalyticsService(
            prisma as unknown as PrismaService,
        );

        expect(await service.purgeExpiredAnalytics(0)).toEqual({
            requests: 0,
            sessions: 0,
        });
        expect(prisma.playbackSession.deleteMany).not.toHaveBeenCalled();
    });
});
