import type { Context } from 'telegraf';
import { Actor } from './core/actor';
import { telegramUserRef } from './core/user-ref';

/**
 * Describe the Telegram user behind `ctx` as a neutral actor.
 */
export function telegramActor(ctx: Context, chatId: string): Actor {
    const from = ctx.from;
    const name = [from?.first_name, from?.last_name]
        .filter((part) => Boolean(part))
        .join(' ');

    let admin: Promise<boolean> | undefined;
    const isAdmin = () => {
        if (!admin) {
            admin = resolveAdmin(ctx, chatId);
        }
        return admin;
    };
    return {
        userRef: from?.id ? telegramUserRef(from.id) : '',
        displayName: name,
        source: 'telegram',
        isAdmin,
    };
}

async function resolveAdmin(ctx: Context, chatId: string): Promise<boolean> {
    if (ctx.chat?.type === 'private') return true;
    // A room with no Telegram chat (web-only, later stages) has no members to
    // ask, and a membership lookup would need a real chat id.
    if (!chatId) return false;
    const member = await ctx.telegram.getChatMember(chatId, ctx.from?.id || 0);
    return ['administrator', 'creator'].includes(member?.status);
}
