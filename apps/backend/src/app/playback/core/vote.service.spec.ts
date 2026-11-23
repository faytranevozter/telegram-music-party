/* Feature and room fixtures are partial by design. */
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import { VoteService } from './vote.service';
import { Actor } from './actor';

function makeActor(userRef = '7'): Actor {
    return {
        userRef,
        displayName: 'Ana',
        source: 'telegram',
        isAdmin: jest.fn().mockResolvedValue(false),
    };
}

function votingRoom(options: {
    minimumVotes?: number | null;
    votes: string[];
}) {
    const { minimumVotes = 3, votes } = options;
    const playback = { addVote: jest.fn() };
    const gateway = { nextCommand: jest.fn() };
    const room = {
        id: 'room',
        Feature: minimumVotes === null ? null : { minimumVotes },
        Votes: votes.map((userId) => ({ userId })),
    };
    return { playback, gateway, room };
}

function build(options: ReturnType<typeof votingRoom>) {
    return new VoteService(options.playback as any, options.gateway as any);
}

describe('VoteService.castNextVote', () => {
    it('refuses a vote from someone who already voted', async () => {
        const options = votingRoom({ votes: ['7'] });
        const result = await build(options).castNextVote(
            options.room as any,
            makeActor(),
        );
        expect(result).toEqual({ status: 'already-voted' });
        expect(options.playback.addVote).not.toHaveBeenCalled();
        expect(options.gateway.nextCommand).not.toHaveBeenCalled();
    });

    it('counts a vote below the minimum and reports progress', async () => {
        const options = votingRoom({ votes: ['99'] });
        const result = await build(options).castNextVote(
            options.room as any,
            makeActor(),
        );
        expect(result).toEqual({ status: 'counted', count: 2, required: 3 });
        expect(options.playback.addVote).toHaveBeenCalledWith('room', '7');
    });

    it('skips without storing the deciding vote', async () => {
        const options = votingRoom({ votes: ['98', '99'] });
        const result = await build(options).castNextVote(
            options.room as any,
            makeActor(),
        );
        expect(result).toEqual({ status: 'passed' });
        expect(options.gateway.nextCommand).toHaveBeenCalledWith('room');
        expect(options.playback.addVote).not.toHaveBeenCalled();
    });

    it('requires five votes when the room has no Feature row', async () => {
        const options = votingRoom({ minimumVotes: null, votes: ['99'] });
        const result = await build(options).castNextVote(
            options.room as any,
            makeActor(),
        );
        expect(result).toEqual({ status: 'counted', count: 2, required: 5 });
    });

    it('counts each user separately', async () => {
        const options = votingRoom({ votes: [] });
        const result = await build(options).castNextVote(
            options.room as any,
            makeActor('123'),
        );
        expect(result).toEqual({ status: 'counted', count: 1, required: 3 });
        expect(options.playback.addVote).toHaveBeenCalledWith('room', '123');
    });
});
