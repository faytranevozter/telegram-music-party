/* Partial Telegraf contexts and private callback seams are deliberate test doubles. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import Keyv from 'keyv';
import { PlaybackTelegramController } from './playback.controller';
import { VideoSearchResult } from 'src/platform/video-search';

const result: VideoSearchResult = {
    videoId: 'dQw4w9WgXcQ',
    title: 'Title <live>',
    channelName: 'A & B',
    durationSeconds: null,
    thumbnailUrl: null,
};

function setup() {
    const cache = new Keyv();
    const gateway = { addToQueueCommand: jest.fn() };
    const playback = {
        getRoomByChatId: jest.fn().mockResolvedValue({
            id: 'room',
            Feature: {
                maxQueueSize: 10,
                playNextCommand: true,
                dailyPlayNextLimit: 0,
            },
        }),
        getQueues: jest.fn().mockResolvedValue([]),
        addToQueue: jest.fn(),
        addPlayNext: jest.fn(),
    };
    const analytics = { recordRequest: jest.fn().mockResolvedValue('request') };
    const provider = { searchSongs: jest.fn().mockResolvedValue([result]) };
    const controller = new PlaybackTelegramController(
        cache,
        gateway as any,
        playback as any,
        analytics as any,
        provider as any,
    );
    const ctx: any = {
        from: { id: 42 },
        update: { inline_query: { id: 'query', query: 'a title' } },
        answerInlineQuery: jest.fn(),
        answerCbQuery: jest.fn(),
        telegram: {
            editMessageText: jest.fn(),
            editMessageReplyMarkup: jest.fn(),
        },
    };
    return { cache, gateway, playback, analytics, provider, controller, ctx };
}

describe('inline video search and queue contract', () => {
    it('answers with article, safe optional metadata, keyboard and awaited callback cache', async () => {
        const { controller, cache, ctx } = setup();
        await controller.search(ctx);
        const [articles, options] = ctx.answerInlineQuery.mock.calls[0];
        expect(articles).toHaveLength(1);
        expect(articles[0]).toMatchObject({
            id: 'query:dQw4w9WgXcQ',
            type: 'article',
            title: result.title,
            description: 'A & B • Duration unavailable',
            input_message_content: {
                message_text: 'Title <live> • Channel: A & B',
            },
        });
        expect(articles[0].thumbnail_url).toBeUndefined();
        expect(articles[0].reply_markup.inline_keyboard.flat()).toContainEqual(
            expect.objectContaining({
                text: 'Add to Queue',
                callback_data: 'queue:42:dQw4w9WgXcQ',
            }),
        );
        expect(options).toEqual({ cache_time: 30, is_personal: true });
        expect(await cache.get('songs:v2:query')).toEqual([result]);
        ctx.update = {
            chosen_inline_result: {
                inline_message_id: 'inline',
                query: 'a title',
                result_id: 'query:dQw4w9WgXcQ',
            },
        };
        await controller.chosenInlineResult(ctx);
        expect(await cache.get('song:v2:inline:dQw4w9WgXcQ')).toEqual(result);
    });
    it('includes Play Next for an eligible known room and thumbnail/duration when present', async () => {
        const { controller, cache, provider, ctx } = setup();
        await cache.set('user-loc:42', { chatId: '-100', threadId: null });
        jest.spyOn(controller as any, 'resolvePlayNextLabel').mockResolvedValue(
            'Play Next',
        );
        provider.searchSongs.mockResolvedValue([
            {
                ...result,
                durationSeconds: 213,
                thumbnailUrl: 'https://img.test/a',
            },
        ]);
        await controller.search(ctx);
        const article = ctx.answerInlineQuery.mock.calls[0][0][0];
        expect(article.thumbnail_url).toBe('https://img.test/a');
        expect(article.description).not.toContain('unavailable');
        expect(article.reply_markup.inline_keyboard.flat()).toContainEqual(
            expect.objectContaining({
                text: 'Play Next',
                callback_data: 'playnext:42:dQw4w9WgXcQ',
            }),
        );
    });
    it.each(['short', 'empty/outage'])(
        'answers %s queries with a short personal cache',
        async (mode) => {
            const { controller, provider, ctx } = setup();
            if (mode === 'short') ctx.update.inline_query.query = 'a';
            else provider.searchSongs.mockResolvedValue([]);
            await controller.search(ctx);
            expect(ctx.answerInlineQuery).toHaveBeenCalledWith([], {
                cache_time: 5,
                is_personal: true,
            });
        },
    );
    it('does not silently swallow unexpected provider programming errors', async () => {
        const { controller, provider, ctx } = setup();
        provider.searchSongs.mockRejectedValue(new Error('bug'));
        await expect(controller.search(ctx)).rejects.toThrow('bug');
    });
    it.each(['completeAddToQueue', 'completePlayNext'])(
        'preserves %s action and keeps channels out of artist analytics',
        async (action) => {
            const { controller, cache, ctx, gateway, analytics, playback } =
                setup();
            await cache.set('song:v2:inline:dQw4w9WgXcQ', result);
            jest.spyOn(controller as any, 'isRoomAdmin').mockResolvedValue(
                true,
            );
            jest.spyOn(controller as any, 'getPlayNextCount').mockResolvedValue(
                0,
            );
            await (controller as any)[action](ctx, {
                videoId: result.videoId,
                inlineMessageId: 'inline',
                chatId: '-100',
                threadId: null,
                userId: 42,
            });
            const next = action === 'completePlayNext';
            expect(
                next ? playback.addPlayNext : playback.addToQueue,
            ).toHaveBeenCalled();
            expect(gateway.addToQueueCommand).toHaveBeenCalledWith(
                'room',
                result.videoId,
                next ? 'next' : 'end',
                expect.stringContaining('Channel: A & B'),
                'request',
            );
            expect(analytics.recordRequest).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: result.title,
                    artist: '',
                    source: next ? 'play_next' : 'queue',
                }),
            );
            expect(ctx.telegram.editMessageText.mock.calls[0][3]).toContain(
                '&lt;live&gt;',
            );
            expect(
                await cache.get('song:v2:inline:dQw4w9WgXcQ'),
            ).toBeUndefined();
        },
    );
});
