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

type AutoplayPreview =
    | { status: 'ok'; tracks: { videoId: string; title: string; artist: string; durationSeconds?: number }[] }
    | { status: 'offline' | 'unavailable' | 'timeout' };

@Injectable()
export class WebRoomService {
    private readonly autoplayReads = new Map<string, Promise<AutoplayPreview>>();

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

    autoplay(roomId: string): Promise<AutoplayPreview> {
        const pending = this.autoplayReads.get(roomId);
        if (pending) return pending;
        const read = this.readAutoplay(roomId).finally(() => this.autoplayReads.delete(roomId));
        this.autoplayReads.set(roomId, read);
        return read;
    }

    private async readAutoplay(roomId: string): Promise<AutoplayPreview> {
        if (!(await this.player.playerOnline(roomId))) return { status: 'offline' };
        const result = await this.player.getPlayerQueue(roomId);
        if (!(await this.player.playerOnline(roomId))) return { status: 'offline' };
        if (result.status !== 'ok') return { status: result.status };
        if (!result.items.length) return { status: 'ok', tracks: [] };

        const anchors = result.items.flatMap((track, index) => track.current ? [index] : []);
        if (!anchors.length) {
            const current = this.player.currentTrack(roomId)?.videoId;
            result.items.forEach((track, index) => { if (track.url === current) anchors.push(index); });
        }
        if (anchors.length !== 1) return { status: 'unavailable' };

        const requests = new Set((await this.playback.getQueues(roomId)).map((track) => track.url));
        const tracks = result.items.slice(anchors[0] + 1)
            .filter((track) => !requests.has(track.url))
            .slice(0, 5)
            .map(({ url, title, artist, durationSeconds }) => ({ videoId: url, title, artist, ...(durationSeconds === undefined ? {} : { durationSeconds }) }));
        return { status: 'ok', tracks };
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
