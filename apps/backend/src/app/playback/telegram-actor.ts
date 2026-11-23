import type { Context } from 'telegraf';
import { Actor } from './core/actor';

/**
 * Describe the Telegram user behind `ctx` as a neutral actor.
 *
 * In stage 1 `userRef` is the bare Telegram user ID so that cache keys, votes
 * and request history stay identical. Stage 2 adds the `telegram:` prefix
 * together with the data migration.
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
        userRef: String(from?.id || 0),
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
