import { Injectable } from '@nestjs/common';
import { PlaybackService } from '../playback.service';
import { PlaybackGateway } from '../playback.gateway';
import { AnalyticsService } from 'src/app/analytics/analytics.service';
import { isVideoResult } from 'src/platform/video-search';
import { Song } from 'src/types/cache.type';
import { Actor } from './actor';
import { PlayNextQuotaService } from './play-next-quota.service';
import { describeSongPlain } from './song-label';
import type { Feature } from '@prisma/client';

export type RequestSongResult =
    | { status: 'play-next-disabled' }
    | { status: 'queue-full' }
    | { status: 'song-expired'; alreadyQueued: boolean }
    | { status: 'video-disabled' }
    | { status: 'duplicate'; song: Song }
    | { status: 'limit-reached'; used: number; limit: number }
    | {
          status: 'added';
          song: Song;
          label: string;
          requestId?: string;
      };

export type RequestSongInput = {
    room: { id: string; Feature: Feature | null };
    videoId: string;
    position: 'end' | 'next';
    actor: Actor;
    loadSong: () => Promise<Song | null | undefined>;
};

/**
 * Validate and queue one song request. Every room rule (queue size, Play Next
 * availability and quota, video search) is enforced here so the Telegram bot
 * and any later web client share one implementation.
 */
@Injectable()
export class QueueRequestService {
    constructor(
        private readonly playbackService: PlaybackService,
        private readonly analyticsService: AnalyticsService,
        private readonly playNextQuota: PlayNextQuotaService,
        private readonly gateway: PlaybackGateway,
    ) {}

    async request(input: RequestSongInput): Promise<RequestSongResult> {
        const { room, videoId, position, actor } = input;
        const playNext = position === 'next';

        if (playNext && room.Feature?.playNextCommand !== true) {
            return { status: 'play-next-disabled' };
        }

        const queueLimit = room.Feature ? room.Feature.maxQueueSize : 10;
        const queues = await this.playbackService.getQueues(room.id);
        if (queues.length >= queueLimit) {
            return { status: 'queue-full' };
        }

        const song = await input.loadSong();
        if (!song) {
            return {
                status: 'song-expired',
                alreadyQueued: queues.some((row) => row.url === videoId),
            };
        }

        // Inline results carry no chat, so the room is only certain here: this
        // is the authoritative per-room gate for video results.
        if (isVideoResult(song) && room.Feature?.allowVideoSearch !== true) {
            return { status: 'video-disabled' };
        }

        if (queues.some((row) => row.url === videoId)) {
            return { status: 'duplicate', song };
        }

        let limitReached = false;
        let used = 0;
        let limit = 0;
        // The old bot always resolved admin status for Play Next and always
        // counted non-admin plays, even in unlimited rooms, so the daily key is
        // written for them too. Turning a limit on mid-day then still counts
        // today's usage.
        const isAdmin = playNext ? await actor.isAdmin() : false;
        if (playNext) {
            limit = room.Feature?.dailyPlayNextLimit ?? 0;
            if (limit > 0) {
                used = await this.playNextQuota.used(room.id, actor.userRef);
                limitReached = !isAdmin && used >= limit;
            }
        }
        if (limitReached) {
            return { status: 'limit-reached', used, limit };
        }

        const label = describeSongPlain(song).plain;

        // Analytics is best-effort: a tracking failure must never block a
        // song request. The request ID becomes the queue row ID.
        let requestId: string | undefined;
        try {
            requestId = await this.analyticsService.recordRequest({
                roomId: room.id,
                requesterId: actor.userRef,
                videoId,
                title: song.title,
                // Song results carry real artists; video channels stay unknown.
                artist: song.artistName ?? '',
                source: playNext ? 'play_next' : 'queue',
            });
        } catch (error) {
            console.error('recordRequest failed', error);
        }

        try {
            if (playNext) {
                await this.playbackService.addPlayNext(
                    room.id,
                    videoId,
                    label,
                    requestId,
                );
            } else {
                await this.playbackService.addToQueue(
                    room.id,
                    videoId,
                    label,
                    requestId,
                );
            }
        } catch (error) {
            if (requestId) {
                await this.analyticsService
                    .markRequestFailed(requestId)
                    .catch(() => undefined);
            }
            throw error;
        }

        if (playNext && !isAdmin) {
            await this.playNextQuota.record(room.id, actor.userRef);
        }

        this.gateway.addToQueueCommand(
            room.id,
            videoId,
            position,
            label,
            requestId,
        );

        return { status: 'added', song, label, requestId };
    }
}
