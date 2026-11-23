/* Partial Telegraf contexts are deliberate test doubles. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { telegramActor } from './telegram-actor';

function makeCtx(options: {
    chatType?: 'private' | 'supergroup';
    from?: { id: number; first_name?: string; last_name?: string };
    memberStatus?: string;
}) {
    const {
        chatType = 'supergroup',
        from = { id: 7, first_name: 'Ana', last_name: 'Silva' },
        memberStatus = 'member',
    } = options;
    const getChatMember = jest.fn().mockResolvedValue({ status: memberStatus });
    const ctx: any = {
        chat: { id: -100, type: chatType },
        from,
        telegram: { getChatMember },
    };
    return { ctx, getChatMember };
}

describe('telegramActor', () => {
    it('uses the bare Telegram user id as the user ref', () => {
        const { ctx } = makeCtx({});
        expect(telegramActor(ctx, '-100').userRef).toBe('7');
        expect(telegramActor(ctx, '-100').source).toBe('telegram');
    });

    it('joins the first and last name for display', () => {
        const { ctx } = makeCtx({});
        expect(telegramActor(ctx, '-100').displayName).toBe('Ana Silva');
    });

    it('treats a private chat as admin without a membership lookup', async () => {
        const { ctx, getChatMember } = makeCtx({ chatType: 'private' });
        const actor = telegramActor(ctx, '-100');

        expect(await actor.isAdmin()).toBe(true);
        expect(getChatMember).not.toHaveBeenCalled();
    });

    it.each(['creator', 'administrator'])(
        'treats a %s as admin',
        async (status) => {
            const { ctx } = makeCtx({ memberStatus: status });
            expect(await telegramActor(ctx, '-100').isAdmin()).toBe(true);
        },
    );

    it('treats a plain member as not admin', async () => {
        const { ctx, getChatMember } = makeCtx({ memberStatus: 'member' });
        expect(await telegramActor(ctx, '-100').isAdmin()).toBe(false);
        expect(getChatMember).toHaveBeenCalledWith('-100', 7);
    });

    it('looks the membership up only once', async () => {
        const { ctx, getChatMember } = makeCtx({ memberStatus: 'member' });
        const actor = telegramActor(ctx, '-100');
        await actor.isAdmin();
        await actor.isAdmin();
        expect(getChatMember).toHaveBeenCalledTimes(1);
    });
});
