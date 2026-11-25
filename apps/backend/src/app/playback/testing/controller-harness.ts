/* Test double wiring for PlaybackTelegramController. Partial Telegraf contexts
   are deliberate. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import Keyv from 'keyv';
import { PlaybackTelegramController } from '../playback.controller';
import { QueueRequestService } from '../core/queue-request.service';
import { WebRoomAccessService } from '../web/web-room-access.service';

type Deps = {
    cache: Keyv;
    gateway: Record<string, jest.Mock>;
    playback: Record<string, jest.Mock>;
    analytics: Record<string, jest.Mock>;
    ytmusic: Record<string, jest.Mock>;
    voteService: Record<string, jest.Mock>;
    playNextQuota: Record<string, jest.Mock>;
    queueRequest: QueueRequestService;
    webAccess: WebRoomAccessService;
};

/** Build the controller with mocked collaborators; override any dependency. */
export function buildController(overrides: Partial<Deps> = {}) {
    const cache = overrides.cache ?? new Keyv();
    const gateway =
        overrides.gateway ??
        ({
            playCommand: jest.fn(),
            pauseCommand: jest.fn(),
            nextCommand: jest.fn(),
            previousCommand: jest.fn(),
            muteCommand: jest.fn(),
            unmuteCommand: jest.fn(),
            lyricsCommand: jest.fn(),
            volumeUp: jest.fn(),
            volumeDown: jest.fn(),
            addToQueueCommand: jest.fn(),
            startRadio: jest.fn().mockResolvedValue({ status: 'ok' }),
            refreshAutoplay: jest.fn().mockResolvedValue({ status: 'ok' }),
            leave: jest.fn(),
        } as Record<string, jest.Mock>);
    const playback =
        overrides.playback ??
        ({
            getRoomByChatId: jest.fn().mockResolvedValue({
                id: 'room',
                Feature: {
                    maxQueueSize: 10,
                    playNextCommand: true,
                    dailyPlayNextLimit: 0,
                    allowVideoSearch: false,
                },
            }),
            getQueues: jest.fn().mockResolvedValue([]),
            addToQueue: jest.fn(),
            addPlayNext: jest.fn(),
        } as Record<string, jest.Mock>);
    const analytics =
        overrides.analytics ??
        ({ recordRequest: jest.fn().mockResolvedValue('request') } as Record<
            string,
            jest.Mock
        >);
    const ytmusic =
        overrides.ytmusic ??
        ({ searchSongs: jest.fn().mockResolvedValue([]) } as Record<
            string,
            jest.Mock
        >);
    const voteService =
        overrides.voteService ??
        ({
            castNextVote: jest.fn().mockResolvedValue({
                status: 'counted',
                count: 1,
                required: 5,
            }),
        } as Record<string, jest.Mock>);
    const playNextQuota =
        overrides.playNextQuota ??
        ({
            used: jest.fn().mockResolvedValue(0),
            remaining: jest.fn().mockResolvedValue(null),
            record: jest.fn(),
        } as Record<string, jest.Mock>);
    const queueRequest =
        overrides.queueRequest ??
        new QueueRequestService(
            playback as any,
            analytics as any,
            playNextQuota as any,
            gateway as any,
            null!,
        );

    const controller = new PlaybackTelegramController(
        cache,
        gateway as any,
        playback as any,
        analytics as any,
        ytmusic as any,
        voteService as any,
        playNextQuota as any,
        queueRequest as any,
        overrides.webAccess,
    );
    return {
        controller,
        cache,
        gateway,
        playback,
        analytics,
        ytmusic,
        voteService,
        playNextQuota,
        queueRequest,
    };
}

/** A group context whose membership lookup answers `status`. */
export function groupContext(
    options: {
        status?: string;
        chatType?: 'private' | 'supergroup';
        userId?: number;
    } = {},
) {
    const { status = 'member', chatType = 'supergroup', userId = 7 } = options;
    const getChatMember = jest.fn().mockResolvedValue({ status });
    const ctx: any = {
        chat: { id: -100, type: chatType },
        from: { id: userId, first_name: 'Ana' },
        reply: jest.fn(),
        answerCbQuery: jest.fn(),
        getChatMember,
        telegram: { getChatMember },
    };
    return { ctx, getChatMember };
}
