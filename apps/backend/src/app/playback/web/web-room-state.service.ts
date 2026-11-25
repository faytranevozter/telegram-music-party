import { Injectable } from '@nestjs/common';
import { PlaybackService } from '../playback.service';
import { PlaybackGateway } from '../playback.gateway';
import type { Actor } from '../core/actor';
import type { Feature, Room } from '@prisma/client';
import { authorizeControl } from '../core/control-access';
import { PlayNextQuotaService } from '../core/play-next-quota.service';
import { voteProgress } from '../core/vote.service';
import { requesterLabel } from '../core/requester-display';

export const controls = [
    'play',
    'pause',
    'next',
    'previous',
    'radio',
    'refresh',
    'mute',
    'unmute',
    'volume-up',
    'volume-down',
] as const;
export type WebControl = (typeof controls)[number];

export function controlAccess(
    room: Pick<Room, 'chatId' | 'ownerUserRef'> & { Feature: Feature | null },
    action: WebControl,
    actor: Actor,
) {
    if (action === 'play' || action === 'pause') return Promise.resolve('ok');
    const volume = action === 'volume-up' || action === 'volume-down';
    if (volume && room.chatId === null && actor.source === 'web' && room.ownerUserRef === actor.userRef)
        return Promise.resolve('ok');
    return authorizeControl(room.Feature, volume ? 'volume' : action, actor);
}

@Injectable()
export class WebRoomStateService {
    constructor(
        private readonly playback: PlaybackService,
        private readonly player: PlaybackGateway,
        private readonly quota: PlayNextQuotaService,
    ) {}

    async snapshot(roomId: string, actor: Actor) {
        const [room, queue, playerOnline] = await Promise.all([
            this.playback.getRoomWithFeatures(roomId),
            this.playback.getQueues(roomId),
            this.player.playerOnline(roomId),
        ]);
        if (!room) return null;
        const owner = await actor.isAdmin();
        const allowed = await Promise.all(
            controls.map((action) =>
                controlAccess(room, action, actor),
            ),
        );
        return {
            name: room.name,
            role: owner ? 'owner' : 'guest',
            queue: queue.map(({ title, url, requesterDisplayName }) => {
                const label = requesterLabel(room.Feature?.requesterDisplay, requesterDisplayName);
                return { title, videoId: url, ...(label ? { requesterLabel: label } : {}) };
            }),
            playerOnline,
            playerState: playerOnline
                ? this.player.currentPlayerState(roomId)
                : null,
            voteProgress: voteProgress(room, actor.userRef),
            nowPlaying: playerOnline ? this.player.currentTrack(roomId) : null,
            capabilities: {
                controls: controls.filter(
                    (_, index) => allowed[index] === 'ok',
                ),
                playNext: room.Feature?.playNextCommand === true,
                playNextRemaining:
                    room.Feature?.playNextCommand && !owner
                        ? await this.quota.remaining(room, actor.userRef)
                        : null,
                videoSearch: room.Feature?.allowVideoSearch === true,
            },
        };
    }
}
