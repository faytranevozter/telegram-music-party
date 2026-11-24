/* Feature and room fixtures are partial by design. */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
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
    const gateway = { nextCommand: jest.fn(), roomChanged: jest.fn() };
    const room = {
        id: 'room',
        Feature: minimumVotes === null ? null : { minimumVotes },
        Votes: votes.map((userId) => ({ userId })),
    };
    const playback = {
        addVote: jest.fn(),
        getRoomWithFeatures: jest.fn().mockResolvedValue(room),
    };
    return { playback, gateway, room };
}

function build(options: ReturnType<typeof votingRoom>) {
    return new VoteService(options.playback as any, options.gateway as any);
}

describe('VoteService.castNextVote', () => {
    it('only emits one skip when two votes reach the threshold concurrently', async () => {
        const options = votingRoom({ votes: ['98', '99'] });
        const service = build(options);
        const results = await Promise.all([
            service.castNextVote(options.room as any, makeActor('7')),
            service.castNextVote(options.room as any, makeActor('8')),
        ]);
        expect(results.map(({ status }) => status)).toEqual([
            'passed',
            'skip-pending',
        ]);
        expect(options.gateway.nextCommand).toHaveBeenCalledTimes(1);
    });
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
        expect(options.gateway.roomChanged).toHaveBeenCalledWith('room');
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
