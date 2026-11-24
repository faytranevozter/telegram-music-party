import {
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Keyv from 'keyv';
import { YTMusicService } from 'src/platform/yt-music.service';
import type { Song } from 'src/types/cache.type';
import type { Actor } from '../core/actor';
import { QueueRequestService } from '../core/queue-request.service';
import { VoteService } from '../core/vote.service';
import { PlaybackService } from '../playback.service';
import { PlaybackGateway } from '../playback.gateway';
import { controlAccess, type WebControl } from './web-room-state.service';

@Injectable()
export class WebRoomService {
    constructor(
        @Inject('KEYV_CACHE') private readonly cache: Keyv,
        private readonly searchProvider: YTMusicService,
        private readonly playback: PlaybackService,
        private readonly player: PlaybackGateway,
        private readonly queue: QueueRequestService,
        private readonly votes: VoteService,
    ) {}

    private async room(id: string) {
        const room = await this.playback.getRoomWithFeatures(id);
        if (!room) throw new NotFoundException();
        return room;
    }

    private selectionKey(roomId: string, actor: Actor, selectionId: string) {
        return `web-selection:${roomId}:${actor.userRef}:${selectionId}`;
    }

    async search(
        roomId: string,
        actor: Actor,
        query: string,
        type: 'song' | 'video',
    ) {
        const room = await this.room(roomId);
        if (type === 'video' && !room.Feature?.allowVideoSearch)
            throw new ForbiddenException('Video search is disabled');
        const songs = await this.searchProvider.searchSongs(query, type);
        return Promise.all(
            songs.slice(0, 20).map(async (song) => {
                const selectionId = randomUUID();
                await this.cache.set(
                    this.selectionKey(roomId, actor, selectionId),
                    song,
                    300_000,
                );
                const {
                    videoId,
                    title,
                    artistName,
                    channelName,
                    durationSeconds,
                    thumbnailUrl,
                } = song;
                return {
                    selectionId,
                    videoId,
                    title,
                    artistName,
                    channelName,
                    durationSeconds,
                    thumbnailUrl,
                };
            }),
        );
    }

    async request(
        roomId: string,
        actor: Actor,
        selectionId: string,
        position: 'end' | 'next',
    ) {
        const song = await this.cache.get<Song>(
            this.selectionKey(roomId, actor, selectionId),
        );
        if (!song)
            throw new NotFoundException({ status: 'selection-not-found' });
        const result = await this.queue.request({
            room: await this.room(roomId),
            actor,
            videoId: song.videoId,
            position,
            loadSong: () => Promise.resolve(song),
        });
        if (
            result.status === 'video-disabled' ||
            result.status === 'play-next-disabled'
        )
            throw new ForbiddenException({ status: result.status });
        if (result.status !== 'added')
            throw new ConflictException({ status: result.status });
        return { status: result.status };
    }

    async vote(roomId: string, actor: Actor) {
        const result = await this.votes.castNextVote(
            await this.room(roomId),
            actor,
        );
        if (
            result.status === 'already-voted' ||
            result.status === 'skip-pending'
        )
            throw new ConflictException(result);
        return result;
    }

    async control(roomId: string, actor: Actor, action: WebControl) {
        const room = await this.room(roomId);
        if ((await controlAccess(room.Feature, action, actor)) !== 'ok')
            throw new ForbiddenException();
        if (!(await this.player.playerOnline(roomId)))
            throw new ConflictException({ status: 'player-offline' });
        switch (action) {
            case 'play':
                this.player.playCommand(roomId);
                break;
            case 'pause':
                this.player.pauseCommand(roomId);
                break;
            case 'next':
                this.player.nextCommand(roomId);
                break;
            case 'previous':
                this.player.previousCommand(roomId);
                break;
            case 'mute':
                this.player.muteCommand(roomId);
                break;
            case 'unmute':
                this.player.unmuteCommand(roomId);
                break;
            case 'volume-up':
                this.player.volumeUp(roomId);
                break;
            case 'volume-down':
                this.player.volumeDown(roomId);
                break;
            case 'radio':
            case 'refresh': {
                const result = await (action === 'radio'
                    ? this.player.startRadio(roomId)
                    : this.player.refreshAutoplay(roomId));
                if (result.status !== 'ok')
                    throw new ConflictException({
                        status:
                            result.status === 'offline'
                                ? 'player-offline'
                                : result.status,
                    });
            }
        }
        return { status: 'ok' };
    }
}
