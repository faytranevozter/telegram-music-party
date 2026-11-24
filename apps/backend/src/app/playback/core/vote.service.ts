import { Injectable } from '@nestjs/common';
import { PlaybackService } from '../playback.service';
import { PlaybackGateway } from '../playback.gateway';
import { Actor } from './actor';
import type { Feature } from '@prisma/client';
import { RoomLock } from './room-lock';

export type VoteResult =
    | { status: 'already-voted' }
    | { status: 'skip-pending' }
    | { status: 'passed' }
    | { status: 'counted'; count: number; required: number };

type VotingRoom = {
    id: string;
    Feature: Feature | null;
    Votes: Array<{ userId: string }>;
};

export function voteProgress(room: VotingRoom, userRef: string) {
    return {
        count: room.Votes.length,
        required: room.Feature?.minimumVotes ?? 5,
        hasVoted: room.Votes.some((vote) => vote.userId === userRef),
    };
}

/**
 * Counting rule for skipping the current track by vote. The vote that reaches
 * the minimum is not stored: it takes effect instead.
 */
@Injectable()
export class VoteService {
    private readonly lock = new RoomLock();
    private readonly skipping = new Map<
        string,
        { epoch: object | undefined; timer: ReturnType<typeof setTimeout> }
    >();
    constructor(
        private readonly playbackService: PlaybackService,
        private readonly gateway: PlaybackGateway,
    ) {}

    castNextVote(room: VotingRoom, actor: Actor): Promise<VoteResult> {
        return this.lock.run(room.id, async () => {
            const fresh = await this.playbackService.getRoomWithFeatures(
                room.id,
            );
            if (!fresh) return { status: 'already-voted' };
            return this.castLocked(fresh, actor);
        });
    }

    private async castLocked(
        room: VotingRoom,
        actor: Actor,
    ): Promise<VoteResult> {
        const progress = voteProgress(room, actor.userRef);
        if (progress.hasVoted) {
            return { status: 'already-voted' };
        }

        const required = progress.required;
        const count = progress.count + 1;

        if (count >= required) {
            const epoch = this.gateway.trackEpoch?.(room.id);
            const pending = this.skipping.get(room.id);
            if (pending && pending.epoch === epoch)
                return { status: 'skip-pending' };
            if (pending) clearTimeout(pending.timer);
            this.gateway.nextCommand(room.id);
            const timer = setTimeout(() => this.skipping.delete(room.id), 5000);
            timer.unref();
            this.skipping.set(room.id, { epoch, timer });
            return { status: 'passed' };
        }

        await this.playbackService.addVote(room.id, actor.userRef);
        this.gateway.roomChanged(room.id);
        return { status: 'counted', count, required };
    }
}
