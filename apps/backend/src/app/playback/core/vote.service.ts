import { Injectable } from '@nestjs/common';
import { PlaybackService } from '../playback.service';
import { PlaybackGateway } from '../playback.gateway';
import { Actor } from './actor';
import type { Feature } from '@prisma/client';

export type VoteResult =
    | { status: 'already-voted' }
    | { status: 'passed' }
    | { status: 'counted'; count: number; required: number };

type VotingRoom = {
    id: string;
    Feature: Feature | null;
    Votes: Array<{ userId: string }>;
};

/**
 * Counting rule for skipping the current track by vote. The vote that reaches
 * the minimum is not stored: it takes effect instead.
 */
@Injectable()
export class VoteService {
    constructor(
        private readonly playbackService: PlaybackService,
        private readonly gateway: PlaybackGateway,
    ) {}

    async castNextVote(room: VotingRoom, actor: Actor): Promise<VoteResult> {
        if (room.Votes.some((vote) => vote.userId === actor.userRef)) {
            return { status: 'already-voted' };
        }

        const required = room.Feature ? room.Feature.minimumVotes : 5;
        const count = room.Votes.length + 1;

        if (count >= required) {
            this.gateway.nextCommand(room.id);
            return { status: 'passed' };
        }

        await this.playbackService.addVote(room.id, actor.userRef);
        return { status: 'counted', count, required };
    }
}
