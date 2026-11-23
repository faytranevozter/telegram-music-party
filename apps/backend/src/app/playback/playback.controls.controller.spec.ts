/* Characterization tests: they pin the current Telegram replies and gateway
   calls so the move onto authorizeControl cannot change behavior. Partial
   Telegraf contexts are deliberate test doubles. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { authorizeControl } from './core/control-access';
import { VoteService } from './core/vote.service';
import { buildController, groupContext } from './testing/controller-harness';

function room(feature: Record<string, unknown> | null) {
    return {
        getRoomByChatId: jest.fn().mockResolvedValue({
            id: 'room',
            Feature: feature,
        }),
    };
}

describe('playback controls access', () => {
    const DISABLED = '⚠️ This feature is currently disabled.';
    const ADMIN_ONLY = '⚠️ This feature is available for admin only.';

    it('refuses a disabled /next and does not emit', async () => {
        const { controller, gateway } = buildController({
            playback: room({ nextCommand: false }) as any,
        });
        const { ctx } = groupContext();
        await controller.next(ctx);
        expect(ctx.reply).toHaveBeenCalledWith(DISABLED);
        expect(gateway.nextCommand).not.toHaveBeenCalled();
    });

    it('refuses /next for a member when admin-only', async () => {
        const { controller, gateway } = buildController({
            playback: room({ nextCommand: true, nextOnlyAdmin: true }) as any,
        });
        const { ctx } = groupContext({ status: 'member' });
        await controller.next(ctx);
        expect(ctx.reply).toHaveBeenCalledWith(ADMIN_ONLY);
        expect(gateway.nextCommand).not.toHaveBeenCalled();
    });

    it('allows /next for an administrator when admin-only', async () => {
        const { controller, gateway } = buildController({
            playback: room({ nextCommand: true, nextOnlyAdmin: true }) as any,
        });
        const { ctx } = groupContext({ status: 'administrator' });
        await controller.next(ctx);
        expect(gateway.nextCommand).toHaveBeenCalledWith('room');
    });

    it('allows /next in a private chat without a membership lookup', async () => {
        const { controller, gateway } = buildController({
            playback: room({ nextCommand: true, nextOnlyAdmin: true }) as any,
        });
        const { ctx, getChatMember } = groupContext({
            chatType: 'private',
            status: 'member',
        });
        await controller.next(ctx);
        expect(gateway.nextCommand).toHaveBeenCalledWith('room');
        expect(getChatMember).not.toHaveBeenCalled();
    });

    it('allows /next in a room without a Feature row', async () => {
        const { controller, gateway } = buildController({
            playback: room(null) as any,
        });
        const { ctx } = groupContext();
        await controller.next(ctx);
        expect(gateway.nextCommand).toHaveBeenCalledWith('room');
    });

    it('refuses a disabled /prev', async () => {
        const { controller, gateway } = buildController({
            playback: room({ previousCommand: false }) as any,
        });
        const { ctx } = groupContext();
        await controller.prev(ctx);
        expect(ctx.reply).toHaveBeenCalledWith(DISABLED);
        expect(gateway.previousCommand).not.toHaveBeenCalled();
    });

    it('refuses /prev for a member when admin-only', async () => {
        const { controller, gateway } = buildController({
            playback: room({
                previousCommand: true,
                previousOnlyAdmin: true,
            }) as any,
        });
        const { ctx } = groupContext({ status: 'member' });
        await controller.prev(ctx);
        expect(ctx.reply).toHaveBeenCalledWith(ADMIN_ONLY);
        expect(gateway.previousCommand).not.toHaveBeenCalled();
    });

    it('refuses /radio for a member when admin-only without prompting', async () => {
        const { controller } = buildController({
            playback: room({ radioCommand: true, radioOnlyAdmin: true }) as any,
        });
        const { ctx } = groupContext({ status: 'member' });
        await controller.radio(ctx);
        expect(ctx.reply).toHaveBeenCalledWith(ADMIN_ONLY);
        expect(ctx.reply).not.toHaveBeenCalledWith(
            expect.stringContaining('Start radio?'),
        );
    });

    it('refuses a disabled /mute', async () => {
        const { controller, gateway } = buildController({
            playback: room({ muteCommand: false }) as any,
        });
        const { ctx } = groupContext();
        await controller.mute(ctx);
        expect(ctx.reply).toHaveBeenCalledWith(DISABLED);
        expect(gateway.muteCommand).not.toHaveBeenCalled();
    });

    it('refuses a disabled volume change', async () => {
        const { controller, gateway } = buildController({
            playback: room({ volumeCommand: false }) as any,
        });
        const { ctx } = groupContext();
        await controller.volumeUp(ctx);
        expect(ctx.reply).toHaveBeenCalledWith(DISABLED);
        expect(gateway.volumeUp).not.toHaveBeenCalled();
    });
});

describe('authorizeControl is the only admin gate used by controls', () => {
    it('never asks Telegram for membership when no control is restricted', async () => {
        const { controller, gateway } = buildController({
            playback: room({
                nextCommand: true,
                nextOnlyAdmin: false,
                muteCommand: true,
            }) as any,
        });
        const { ctx, getChatMember } = groupContext({ status: 'member' });
        await controller.next(ctx);
        await controller.mute(ctx);
        expect(getChatMember).not.toHaveBeenCalled();
        expect(gateway.nextCommand).toHaveBeenCalledWith('room');
        expect(gateway.muteCommand).toHaveBeenCalledWith('room');
    });
});

// Guard: the policy itself stays covered here too, since the controller now
// depends on it for every control.
it('imports the shared policy', () => {
    expect(typeof authorizeControl).toBe('function');
});

function votingRoom(options: {
    minimumVotes?: number | null;
    votes: string[];
}) {
    const { minimumVotes = 3, votes } = options;
    const playback = {
        getDevicesByChatId: jest.fn().mockResolvedValue({
            id: 'room',
            Feature: minimumVotes === null ? null : { minimumVotes },
            Votes: votes.map((userId) => ({ userId })),
        }),
        addVote: jest.fn(),
    };
    const gateway = {
        nextCommand: jest.fn(),
        muteCommand: jest.fn(),
        previousCommand: jest.fn(),
    };
    // Use the real service so the controller test still proves end behavior.
    const voteService = new VoteService(playback as any, gateway as any);
    return { playback, gateway, voteService };
}

describe('vote_next', () => {
    const ALREADY = `Nice try, DJ—but you've already voted! Let's see what the others pick 🎧`;

    it('refuses a second vote from the same user', async () => {
        const playback = votingRoom({ votes: ['7'] });
        const { controller } = buildController({
            playback: playback.playback as any,
            gateway: playback.gateway,
            voteService: playback.voteService as any,
        });
        const { ctx } = groupContext();
        await controller.vote_next(ctx);
        expect(ctx.reply).toHaveBeenCalledWith(ALREADY);
        expect(playback.playback.addVote).not.toHaveBeenCalled();
        expect(playback.gateway.nextCommand).not.toHaveBeenCalled();
    });

    it('stores a vote and reports progress', async () => {
        const playback = votingRoom({ votes: ['99'] });
        const { controller } = buildController({
            playback: playback.playback as any,
            gateway: playback.gateway,
            voteService: playback.voteService as any,
        });
        const { ctx } = groupContext();
        await controller.vote_next(ctx);
        expect(playback.playback.addVote).toHaveBeenCalledWith('room', '7');
        expect(ctx.reply.mock.calls[0][0]).toContain('2/3');
        expect(playback.gateway.nextCommand).not.toHaveBeenCalled();
    });

    it('skips when the vote reaches the minimum', async () => {
        const playback = votingRoom({ votes: ['98', '99'] });
        const { controller } = buildController({
            playback: playback.playback as any,
            gateway: playback.gateway,
            voteService: playback.voteService as any,
        });
        const { ctx } = groupContext();
        await controller.vote_next(ctx);
        expect(playback.gateway.nextCommand).toHaveBeenCalledWith('room');
        expect(ctx.reply.mock.calls[0][0]).toContain('Minimum votes reached');
        expect(playback.playback.addVote).not.toHaveBeenCalled();
    });

    it('defaults to five votes when the room has no Feature row', async () => {
        const playback = votingRoom({ minimumVotes: null, votes: ['99'] });
        const { controller } = buildController({
            playback: playback.playback as any,
            gateway: playback.gateway,
            voteService: playback.voteService as any,
        });
        const { ctx } = groupContext();
        await controller.vote_next(ctx);
        expect(ctx.reply.mock.calls[0][0]).toContain('/5');
    });
});
