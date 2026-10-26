import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/platform/prisma.service';
import { ENV } from 'src/config/env';
import type { PlaybackReport } from 'src/types/analytics.type';
import {
    isCompletedPlay,
    isQualifiedPlay,
    nextRequestOutcome,
    resolvePeriod,
    sessionStatusForEnd,
    STALE_SESSION_MS,
    type StatsPeriod,
} from './analytics.util';

export interface RoomOverview {
    label: string;
    from: Date | null;
    coverageStart: Date | null;
    requests: number;
    failedRequests: number;
    requesters: number;
    started: number;
    qualified: number;
    completed: number;
    skipped: number;
    incomplete: number;
    uniqueTracks: number;
    listenedMs: number;
}

export interface TopSong {
    videoId: string;
    title: string;
    artist: string;
    count: number;
    listenedMs: number;
}

export interface TopArtist {
    artist: string;
    plays: number;
    listenedMs: number;
}

export interface RequesterStats {
    requesterId: string;
    requests: number;
    uniqueTracks: number;
}

export interface RecentPlayback {
    id: string;
    videoId: string;
    title: string;
    artist: string;
    source: string;
    startedAt: Date;
    endedAt: Date | null;
    listenedMs: number;
    qualified: boolean;
    completed: boolean;
    endReason: string | null;
    status: string;
    requesterId: string | null;
}

export interface RequesterOverview {
    requests: number;
    uniqueTracks: number;
    started: number;
    qualified: number;
    completed: number;
    listenedMs: number;
}

export interface RequestRecordInput {
    roomId: string;
    requesterId?: number | string | null;
    videoId: string;
    title: string;
    artist: string;
    source: 'queue' | 'play_next';
}

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
    private retentionTimer: NodeJS.Timeout | null = null;

    constructor(private readonly prisma: PrismaService) {}

    onModuleInit() {
        if (ENV.ANALYTICS_RETENTION_DAYS <= 0) return;
        const run = () => {
            void this.purgeExpiredAnalytics().catch((error) =>
                console.error('analytics retention failed', error),
            );
        };
        run();
        this.retentionTimer = setInterval(run, 24 * 60 * 60 * 1000);
        // Do not keep the process alive only for the purge timer.
        this.retentionTimer.unref?.();
    }

    onModuleDestroy() {
        if (this.retentionTimer) {
            clearInterval(this.retentionTimer);
            this.retentionTimer = null;
        }
    }

    /**
     * Delete raw events past the retention window. Aggregated totals are not
     * stored separately in this version, so old history disappears together.
     */
    async purgeExpiredAnalytics(
        retentionDays = ENV.ANALYTICS_RETENTION_DAYS,
    ): Promise<{ requests: number; sessions: number }> {
        if (!retentionDays || retentionDays <= 0) {
            return { requests: 0, sessions: 0 };
        }
        const cutoff = new Date(
            Date.now() - retentionDays * 24 * 60 * 60 * 1000,
        );
        const sessions = await this.prisma.playbackSession.deleteMany({
            where: { startedAt: { lt: cutoff } },
        });
        const requests = await this.prisma.songRequest.deleteMany({
            where: {
                requestedAt: { lt: cutoff },
                // Keep a request that still has a recent playback linked to it.
                PlaybackSessions: { none: { startedAt: { gte: cutoff } } },
            },
        });
        return { sessions: sessions.count, requests: requests.count };
    }

    /** Persist a durable request; returns the ID used to correlate playback. */
    async recordRequest(input: RequestRecordInput): Promise<string> {
        const request = await this.prisma.songRequest.create({
            data: {
                roomId: input.roomId,
                requesterId:
                    input.requesterId === null ||
                    input.requesterId === undefined
                        ? null
                        : String(input.requesterId),
                videoId: input.videoId,
                title: input.title.slice(0, 300),
                artist: input.artist.slice(0, 300),
                source: input.source,
                outcome: 'queued',
            },
            select: { id: true },
        });
        return request.id;
    }

    async markRequestFailed(requestId: string) {
        await this.prisma.songRequest.updateMany({
            where: { id: requestId, outcome: 'queued' },
            data: { outcome: 'failed' },
        });
    }

    /**
     * Upsert one observed playback interval. Reports are idempotent: retries
     * only raise the observed listening time, and an end report never
     * resurrects a finished session.
     */
    async recordPlayback(report: PlaybackReport): Promise<void> {
        const existing = await this.prisma.playbackSession.findUnique({
            where: { id: report.playbackId },
        });

        // Only trust a request correlation that belongs to this room and track.
        const reportedRequestId =
            report.requestId ??
            (existing?.requestId ? existing.requestId : null);
        let request: { id: string; outcome: string } | null = null;
        if (reportedRequestId) {
            request = await this.prisma.songRequest.findFirst({
                where: {
                    id: reportedRequestId,
                    roomId: report.roomId,
                    videoId: report.videoId,
                },
                select: { id: true, outcome: true },
            });
        }
        const requestId = request?.id ?? null;

        const listenedMs = Math.max(
            existing?.listenedMs ?? 0,
            report.listenedMs,
        );
        const durationMs = report.durationMs ?? existing?.durationMs ?? null;
        const endReason =
            report.event === 'end' ? (report.endReason ?? 'unknown') : null;
        const qualified =
            (existing?.qualified ?? false) ||
            isQualifiedPlay(listenedMs, durationMs);
        // Completion is an ending, not just a threshold: an interrupted or
        // skipped session never counts as completed even past 90% observed.
        const completed =
            (existing?.completed ?? false) ||
            (endReason === 'completed' &&
                isCompletedPlay(listenedMs, durationMs));

        if (!existing) {
            try {
                await this.prisma.playbackSession.create({
                    data: {
                        id: report.playbackId,
                        roomId: report.roomId,
                        videoId: report.videoId,
                        requestId,
                        title: report.title,
                        artist: report.artist,
                        durationMs,
                        source: report.source,
                        startedAt: new Date(report.startedAt),
                        endedAt: report.endedAt
                            ? new Date(report.endedAt)
                            : null,
                        listenedMs,
                        endReason,
                        status: endReason
                            ? sessionStatusForEnd(endReason)
                            : 'open',
                        qualified,
                        completed,
                    },
                });
            } catch (error) {
                // Duplicate start reports race on the primary key; the other
                // path already persisted this session.
                if ((error as { code?: string }).code !== 'P2002') throw error;
            }
        } else {
            // A reconnect after an interrupted close resumes the same playback.
            // Once a definitive end is recorded, later reports only raise the
            // observed listening time and never change the outcome.
            let nextEndReason = existing.endReason;
            let nextEndedAt = existing.endedAt;
            let nextStatus = existing.status;

            if (report.event === 'end') {
                if (
                    existing.endReason === null ||
                    existing.endReason === 'interrupted'
                ) {
                    nextEndReason = endReason;
                    nextEndedAt = report.endedAt
                        ? new Date(report.endedAt)
                        : (existing.endedAt ?? new Date());
                    nextStatus = sessionStatusForEnd(endReason ?? 'unknown');
                }
            } else if (existing.endReason === 'interrupted') {
                nextEndReason = null;
                nextEndedAt = null;
                nextStatus = 'open';
            }

            await this.prisma.playbackSession.update({
                where: { id: existing.id },
                data: {
                    requestId: existing.requestId ?? requestId,
                    title: report.title || existing.title,
                    artist: report.artist || existing.artist,
                    durationMs,
                    source:
                        report.source === 'unknown'
                            ? existing.source
                            : report.source,
                    listenedMs,
                    qualified,
                    completed,
                    endReason: nextEndReason,
                    endedAt: nextEndedAt,
                    status: nextStatus,
                },
            });
        }

        if (request) {
            const outcome = nextRequestOutcome(
                request.outcome,
                report.event,
                report.endReason,
            );
            if (outcome !== request.outcome) {
                await this.prisma.songRequest.update({
                    where: { id: request.id },
                    data: { outcome },
                });
            }
        }
    }

    /** Close a room's open sessions when the admitted device leaves. */
    async closeRoomSessions(
        roomId: string,
        reason: 'interrupted' | 'replaced' = 'interrupted',
    ) {
        await this.prisma.playbackSession.updateMany({
            where: { roomId, status: 'open' },
            data: {
                endReason: reason,
                status: 'incomplete',
                endedAt: new Date(),
            },
        });
    }

    /**
     * Sessions with no checkpoint for a while cannot establish an end. Mark
     * them incomplete without inventing a completion or a skip.
     */
    async finalizeStaleSessions(roomId: string) {
        await this.prisma.playbackSession.updateMany({
            where: {
                roomId,
                status: 'open',
                updatedAt: { lt: new Date(Date.now() - STALE_SESSION_MS) },
            },
            data: { status: 'incomplete', endReason: 'interrupted' },
        });
    }

    async getCoverageStart(roomId: string): Promise<Date | null> {
        const [requests, sessions] = await Promise.all([
            this.prisma.songRequest.aggregate({
                where: { roomId },
                _min: { requestedAt: true },
            }),
            this.prisma.playbackSession.aggregate({
                where: { roomId },
                _min: { startedAt: true },
            }),
        ]);
        const candidates = [
            requests._min.requestedAt,
            sessions._min.startedAt,
        ].filter((value): value is Date => value instanceof Date);
        if (candidates.length === 0) return null;
        return candidates.reduce((a, b) => (a < b ? a : b));
    }

    async getRoomOverview(
        roomId: string,
        period: StatsPeriod,
        now: Date = new Date(),
    ): Promise<RoomOverview> {
        await this.finalizeStaleSessions(roomId);
        const { start, label } = resolvePeriod(period, now);
        const requestedRange = start ? { gte: start } : undefined;
        const startedRange = start ? { gte: start } : undefined;

        const [requests, failedRequests, requesters, sessions, coverageStart] =
            await Promise.all([
                this.prisma.songRequest.count({
                    where: {
                        roomId,
                        outcome: { not: 'failed' },
                        ...(requestedRange
                            ? { requestedAt: requestedRange }
                            : {}),
                    },
                }),
                this.prisma.songRequest.count({
                    where: {
                        roomId,
                        outcome: 'failed',
                        ...(requestedRange
                            ? { requestedAt: requestedRange }
                            : {}),
                    },
                }),
                this.prisma.songRequest.findMany({
                    where: {
                        roomId,
                        outcome: { not: 'failed' },
                        requesterId: { not: null },
                        ...(requestedRange
                            ? { requestedAt: requestedRange }
                            : {}),
                    },
                    select: { requesterId: true },
                    distinct: ['requesterId'],
                }),
                this.prisma.playbackSession.findMany({
                    where: {
                        roomId,
                        ...(startedRange ? { startedAt: startedRange } : {}),
                    },
                    select: {
                        videoId: true,
                        listenedMs: true,
                        qualified: true,
                        completed: true,
                        endReason: true,
                        status: true,
                    },
                }),
                this.getCoverageStart(roomId),
            ]);

        const uniqueTracks = new Set(sessions.map((item) => item.videoId));
        return {
            label,
            from: start,
            coverageStart,
            requests,
            failedRequests,
            requesters: requesters.length,
            started: sessions.length,
            qualified: sessions.filter((item) => item.qualified).length,
            completed: sessions.filter((item) => item.completed).length,
            skipped: sessions.filter((item) => item.endReason === 'skipped')
                .length,
            incomplete: sessions.filter(
                (item) =>
                    item.status === 'incomplete' ||
                    item.endReason === 'unknown',
            ).length,
            uniqueTracks: uniqueTracks.size,
            listenedMs: sessions.reduce(
                (total, item) => total + item.listenedMs,
                0,
            ),
        };
    }

    async getTopRequestedSongs(
        roomId: string,
        period: StatsPeriod,
        limit = 5,
    ): Promise<TopSong[]> {
        const { start } = resolvePeriod(period);
        const rows = await this.prisma.songRequest.groupBy({
            by: ['videoId'],
            where: {
                roomId,
                outcome: { not: 'failed' },
                ...(start ? { requestedAt: { gte: start } } : {}),
            },
            _count: { videoId: true },
            _max: { title: true, artist: true },
            orderBy: { _count: { videoId: 'desc' } },
            take: limit,
        });
        const videoIds = rows.map((row) => row.videoId);
        const latest = await this.prisma.songRequest.findMany({
            where: {
                roomId,
                outcome: { not: 'failed' },
                videoId: { in: videoIds },
                ...(start ? { requestedAt: { gte: start } } : {}),
            },
            orderBy: { requestedAt: 'desc' },
            select: { videoId: true, title: true, artist: true },
        });
        const latestByVideo = new Map<
            string,
            { title: string; artist: string }
        >();
        for (const item of latest) {
            if (!latestByVideo.has(item.videoId)) {
                latestByVideo.set(item.videoId, item);
            }
        }
        return rows.map((row) => ({
            videoId: row.videoId,
            title:
                latestByVideo.get(row.videoId)?.title ?? row._max.title ?? '',
            artist:
                latestByVideo.get(row.videoId)?.artist ?? row._max.artist ?? '',
            count: row._count.videoId,
            listenedMs: 0,
        }));
    }

    async getTopPlayedSongs(
        roomId: string,
        period: StatsPeriod,
        limit = 5,
    ): Promise<TopSong[]> {
        const { start } = resolvePeriod(period);
        const rows = await this.prisma.playbackSession.groupBy({
            by: ['videoId'],
            where: {
                roomId,
                qualified: true,
                ...(start ? { startedAt: { gte: start } } : {}),
            },
            _count: { videoId: true },
            _sum: { listenedMs: true },
            _max: { title: true, artist: true },
            orderBy: [
                { _count: { videoId: 'desc' } },
                { _sum: { listenedMs: 'desc' } },
            ],
            take: limit,
        });
        const videoIds = rows.map((row) => row.videoId);
        const latest = await this.prisma.playbackSession.findMany({
            where: {
                roomId,
                qualified: true,
                videoId: { in: videoIds },
                ...(start ? { startedAt: { gte: start } } : {}),
            },
            orderBy: { startedAt: 'desc' },
            select: { videoId: true, title: true, artist: true },
        });
        const latestByVideo = new Map<
            string,
            { title: string; artist: string }
        >();
        for (const item of latest) {
            if (!latestByVideo.has(item.videoId)) {
                latestByVideo.set(item.videoId, item);
            }
        }
        return rows.map((row) => ({
            videoId: row.videoId,
            title:
                latestByVideo.get(row.videoId)?.title ?? row._max.title ?? '',
            artist:
                latestByVideo.get(row.videoId)?.artist ?? row._max.artist ?? '',
            count: row._count.videoId,
            listenedMs: row._sum.listenedMs ?? 0,
        }));
    }

    async getTopArtists(
        roomId: string,
        period: StatsPeriod,
        limit = 5,
    ): Promise<TopArtist[]> {
        const { start } = resolvePeriod(period);
        const rows = await this.prisma.playbackSession.groupBy({
            by: ['artist'],
            where: {
                roomId,
                qualified: true,
                artist: { not: '' },
                ...(start ? { startedAt: { gte: start } } : {}),
            },
            _count: { artist: true },
            _sum: { listenedMs: true },
            orderBy: [
                { _count: { artist: 'desc' } },
                { _sum: { listenedMs: 'desc' } },
            ],
            take: limit,
        });
        return rows.map((row) => ({
            artist: row.artist,
            plays: row._count.artist,
            listenedMs: row._sum.listenedMs ?? 0,
        }));
    }

    async getTopRequesters(
        roomId: string,
        period: StatsPeriod,
        limit = 5,
    ): Promise<RequesterStats[]> {
        const { start } = resolvePeriod(period);
        const where = {
            roomId,
            requesterId: { not: null },
            outcome: { not: 'failed' },
            ...(start ? { requestedAt: { gte: start } } : {}),
        } as const;
        const rows = await this.prisma.songRequest.groupBy({
            by: ['requesterId'],
            where,
            _count: { requesterId: true },
            orderBy: { _count: { requesterId: 'desc' } },
            take: limit,
        });
        const requesterIds = rows
            .map((row) => row.requesterId)
            .filter((id): id is string => Boolean(id));
        if (requesterIds.length === 0) return [];

        const tracks = await this.prisma.songRequest.findMany({
            where: {
                roomId,
                requesterId: { in: requesterIds },
                outcome: { not: 'failed' },
                ...(start ? { requestedAt: { gte: start } } : {}),
            },
            select: { requesterId: true, videoId: true },
            distinct: ['requesterId', 'videoId'],
        });
        const uniqueByRequester = new Map<string, number>();
        for (const track of tracks) {
            if (!track.requesterId) continue;
            uniqueByRequester.set(
                track.requesterId,
                (uniqueByRequester.get(track.requesterId) ?? 0) + 1,
            );
        }

        return rows
            .filter(
                (
                    row,
                ): row is typeof row & {
                    requesterId: string;
                } => Boolean(row.requesterId),
            )
            .map((row) => ({
                requesterId: row.requesterId,
                requests: row._count.requesterId,
                uniqueTracks: uniqueByRequester.get(row.requesterId) ?? 0,
            }));
    }

    async getRecentPlaybacks(
        roomId: string,
        period: StatsPeriod,
        limit = 10,
    ): Promise<RecentPlayback[]> {
        await this.finalizeStaleSessions(roomId);
        const { start } = resolvePeriod(period);
        const rows = await this.prisma.playbackSession.findMany({
            where: { roomId, ...(start ? { startedAt: { gte: start } } : {}) },
            orderBy: { startedAt: 'desc' },
            take: limit,
            select: {
                id: true,
                videoId: true,
                title: true,
                artist: true,
                source: true,
                startedAt: true,
                endedAt: true,
                listenedMs: true,
                qualified: true,
                completed: true,
                endReason: true,
                status: true,
                request: { select: { requesterId: true } },
            },
        });
        return rows.map((row) => ({
            id: row.id,
            videoId: row.videoId,
            title: row.title,
            artist: row.artist,
            source: row.source,
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            listenedMs: row.listenedMs,
            qualified: row.qualified,
            completed: row.completed,
            endReason: row.endReason,
            status: row.status,
            requesterId: row.request?.requesterId ?? null,
        }));
    }

    /** Participation and listening attributed to one requester in this room. */
    async getRequesterOverview(
        roomId: string,
        requesterId: string,
        period: StatsPeriod,
    ): Promise<RequesterOverview> {
        await this.finalizeStaleSessions(roomId);
        const { start } = resolvePeriod(period);
        const requests = await this.prisma.songRequest.findMany({
            where: {
                roomId,
                requesterId,
                outcome: { not: 'failed' },
                ...(start ? { requestedAt: { gte: start } } : {}),
            },
            select: { id: true, videoId: true },
        });
        const uniqueTracks = new Set(requests.map((item) => item.videoId));
        if (requests.length === 0) {
            return {
                requests: 0,
                uniqueTracks: 0,
                started: 0,
                qualified: 0,
                completed: 0,
                listenedMs: 0,
            };
        }

        const sessions = await this.prisma.playbackSession.findMany({
            where: {
                roomId,
                requestId: { in: requests.map((item) => item.id) },
                ...(start ? { startedAt: { gte: start } } : {}),
            },
            select: {
                listenedMs: true,
                qualified: true,
                completed: true,
            },
        });

        return {
            requests: requests.length,
            uniqueTracks: uniqueTracks.size,
            started: sessions.length,
            qualified: sessions.filter((item) => item.qualified).length,
            completed: sessions.filter((item) => item.completed).length,
            listenedMs: sessions.reduce(
                (total, item) => total + item.listenedMs,
                0,
            ),
        };
    }
}
