/* Room, feature and song fixtures are partial by design. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { QueueRequestService } from './queue-request.service';
import { describeSongPlain } from './song-label';
import { Actor } from './actor';
import { Song } from 'src/types/cache.type';

const song: Song = {
    videoId: 'vid',
    title: 'Title',
    artistName: 'Artist',
    channelName: null,
    durationSeconds: 213,
    thumbnailUrl: null,
};

const videoSong: Song = {
    ...song,
    artistName: null,
    channelName: 'Channel',
};

function makeActor(userRef = '7', isAdmin = false): Actor {
    return {
        userRef,
        displayName: 'Ana',
        source: 'telegram',
        isAdmin: jest.fn().mockResolvedValue(isAdmin),
    };
}

function build(
    options: {
        queues?: Array<{ url: string }>;
        song?: Song | null;
        feature?: Record<string, unknown> | null;
        admin?: boolean;
        addToQueueRejects?: boolean;
        recordRejects?: boolean;
    } = {},
) {
    const {
        queues = [],
        song: loaded = song,
        feature = {
            maxQueueSize: 10,
            playNextCommand: true,
            allowVideoSearch: false,
            dailyPlayNextLimit: 0,
        },
        admin = false,
        addToQueueRejects = false,
        recordRejects = false,
    } = options;

    const playback = {
        getQueues: jest.fn().mockResolvedValue(queues),
        addToQueue: jest.fn(),
        addPlayNext: jest.fn(),
    };
    if (addToQueueRejects) {
        playback.addToQueue.mockRejectedValue(new Error('db down'));
        playback.addPlayNext.mockRejectedValue(new Error('db down'));
    }
    const analytics = {
        recordRequest: recordRejects
            ? jest.fn().mockRejectedValue(new Error('tracking down'))
            : jest.fn().mockResolvedValue('request-id'),
        markRequestFailed: jest.fn().mockResolvedValue(undefined),
    };
    const gateway = { addToQueueCommand: jest.fn() };
    const quota = {
        used: jest.fn().mockResolvedValue(0),
        remaining: jest.fn().mockResolvedValue(null),
        record: jest.fn(),
    };
    const guestQuota = { reserve: jest.fn().mockResolvedValue({ allowed: true, reservationId: 'reservation' }), release: jest.fn().mockResolvedValue(undefined) };
    const service = new QueueRequestService(
        playback as any,
        analytics as any,
        quota as any,
        gateway as any,
        guestQuota as any,
    );
    const room = { id: 'room', Feature: feature };
    const input = {
        room: room as any,
        videoId: 'vid',
        actor: makeActor('7', admin),
        loadSong: jest.fn().mockResolvedValue(loaded),
    };
    return { service, playback, analytics, gateway, quota, guestQuota, room, input };
}

it('does not insert when the guest request allowance is exhausted', async () => {
    const { service, playback, input, guestQuota } = build();
    guestQuota.reserve.mockResolvedValue({ allowed: false, retryAt: 1234 });
    await expect(service.request({ ...input, position: 'end', webGuestQuota: { limit: 3, periodMinutes: 10 } })).rejects.toMatchObject({ status: 429, response: { status: 'guest-request-limit', retryAt: 1234 } });
    expect(playback.addToQueue).not.toHaveBeenCalled();
});

it('releases a guest reservation if inserting the track fails', async () => {
    const { service, playback, input, guestQuota } = build();
    playback.addToQueue.mockRejectedValueOnce(new Error('insert failed'));
    await expect(service.request({ ...input, position: 'end', webGuestQuota: { limit: 3, periodMinutes: 10 } })).rejects.toThrow('insert failed');
    expect(guestQuota.release).toHaveBeenCalledWith('room', input.actor.userRef, 'reservation');
});

describe('describeSongPlain', () => {
    it('formats the plain label used by the player and the chat', () => {
        expect(describeSongPlain(song)).toEqual({
            credit: 'Artist',
            duration: '3:33',
            plain: 'Title - Artist [3:33]',
        });
    });

    it('marks a missing duration instead of guessing one', () => {
        expect(
            describeSongPlain({ ...song, durationSeconds: null }).plain,
        ).toContain('[Duration unavailable]');
    });
});

describe('QueueRequestService.request', () => {
    it('records a request without a known actor as anonymous', async () => {
        const { service, analytics, input } = build();
        await service.request({
            ...input,
            position: 'end',
            actor: makeActor(''),
        });
        expect(analytics.recordRequest).toHaveBeenCalledWith(
            expect.objectContaining({ requesterId: null }),
        );
    });

    it('refuses Play Next in a room that disabled it', async () => {
        const { service, input } = build({
            feature: { playNextCommand: false, maxQueueSize: 10 },
        });
        const result = await service.request({ ...input, position: 'next' });
        expect(result).toEqual({ status: 'play-next-disabled' });
    });

    it('ignores the Play Next flag for a normal queue request', async () => {
        const { service, input } = build({
            feature: {
                playNextCommand: false,
                maxQueueSize: 10,
                allowVideoSearch: false,
            },
        });
        const result = await service.request({ ...input, position: 'end' });
        expect(result.status).toBe('added');
    });

    it('refuses a full queue without loading the song', async () => {
        const { service, input } = build({
            feature: { maxQueueSize: 1, playNextCommand: true },
            queues: [{ url: 'other' }],
        });
        const result = await service.request({ ...input, position: 'end' });
        expect(result).toEqual({ status: 'queue-full' });
        expect(input.loadSong).not.toHaveBeenCalled();
    });

    it('defaults the queue limit to ten without a Feature row', async () => {
        const queues = Array.from({ length: 10 }, (_, i) => ({ url: `v${i}` }));
        const { service, input } = build({ feature: null, queues });
        const result = await service.request({ ...input, position: 'end' });
        expect(result).toEqual({ status: 'queue-full' });
    });

    it('reports an expired song and whether it is already queued', async () => {
        const { service, input } = build({
            song: null,
            queues: [{ url: 'vid' }],
        });
        const result = await service.request({ ...input, position: 'end' });
        expect(result).toEqual({ status: 'song-expired', alreadyQueued: true });
    });

    it('refuses a video result when Video Search is off', async () => {
        const { service, input } = build({
            song: videoSong,
            feature: { maxQueueSize: 10, playNextCommand: true },
        });
        const result = await service.request({ ...input, position: 'end' });
        expect(result).toEqual({ status: 'video-disabled' });
    });

    it('refuses a track that is already queued', async () => {
        const { service, input } = build({ queues: [{ url: 'vid' }] });
        const result = await service.request({ ...input, position: 'end' });
        expect(result.status).toBe('duplicate');
    });

    it('refuses Play Next once the daily limit is used up', async () => {
        const { service, quota, playback, input } = build({
            feature: {
                maxQueueSize: 10,
                playNextCommand: true,
                dailyPlayNextLimit: 3,
            },
        });
        quota.used.mockResolvedValue(3);
        const result = await service.request({ ...input, position: 'next' });
        expect(result).toEqual({ status: 'limit-reached', used: 3, limit: 3 });
        expect(playback.addPlayNext).not.toHaveBeenCalled();
    });

    it('never limits an admin and never records the quota', async () => {
        const { service, quota, input } = build({
            feature: {
                maxQueueSize: 10,
                playNextCommand: true,
                dailyPlayNextLimit: 3,
            },
            admin: true,
        });
        quota.used.mockResolvedValue(3);
        const result = await service.request({ ...input, position: 'next' });
        expect(result.status).toBe('added');
        expect(quota.record).not.toHaveBeenCalled();
    });

    it('records the allowance for a non-admin even in an unlimited room', async () => {
        const { service, quota, input } = build({
            feature: {
                maxQueueSize: 10,
                playNextCommand: true,
                dailyPlayNextLimit: 0,
            },
        });
        const result = await service.request({ ...input, position: 'next' });
        expect(result.status).toBe('added');
        expect(quota.record).toHaveBeenCalledWith('room', '7');
    });

    it('never records the allowance for an admin in an unlimited room', async () => {
        const { service, quota, input } = build({
            feature: {
                maxQueueSize: 10,
                playNextCommand: true,
                dailyPlayNextLimit: 0,
            },
            admin: true,
        });
        const result = await service.request({ ...input, position: 'next' });
        expect(result.status).toBe('added');
        expect(quota.record).not.toHaveBeenCalled();
    });

    it('queues a request at the end with analytics and a player event', async () => {
        const { service, playback, analytics, gateway, input } = build();
        const result = await service.request({ ...input, position: 'end' });

        expect(result).toEqual({
            status: 'added',
            song,
            label: 'Title - Artist [3:33]',
            requestId: 'request-id',
        });
        expect(playback.addToQueue).toHaveBeenCalledWith(
            'room',
            'vid',
            'Title - Artist [3:33]',
            'request-id',
        );
        expect(analytics.recordRequest).toHaveBeenCalledWith({
            roomId: 'room',
            requesterId: '7',
            videoId: 'vid',
            title: 'Title',
            artist: 'Artist',
            source: 'queue',
        });
        expect(gateway.addToQueueCommand).toHaveBeenCalledWith(
            'room',
            'vid',
            'end',
            'Title - Artist [3:33]',
            'request-id',
        );
    });

    it('places Play Next at the head and records the quota', async () => {
        const { service, playback, analytics, gateway, quota, input } = build({
            feature: {
                maxQueueSize: 10,
                playNextCommand: true,
                dailyPlayNextLimit: 3,
            },
        });
        const result = await service.request({ ...input, position: 'next' });

        expect(result.status).toBe('added');
        expect(playback.addPlayNext).toHaveBeenCalled();
        expect(analytics.recordRequest).toHaveBeenCalledWith(
            expect.objectContaining({ source: 'play_next', requesterId: '7' }),
        );
        expect(gateway.addToQueueCommand).toHaveBeenCalledWith(
            'room',
            'vid',
            'next',
            expect.any(String),
            'request-id',
        );
        expect(quota.record).toHaveBeenCalledWith('room', '7');
    });

    it('still queues when analytics fails', async () => {
        const { service, playback, input } = build({ recordRejects: true });
        const result = await service.request({ ...input, position: 'end' });

        expect(result.status).toBe('added');
        expect((result as { requestId?: string }).requestId).toBeUndefined();
        expect(playback.addToQueue).toHaveBeenCalledWith(
            'room',
            'vid',
            expect.any(String),
            undefined,
        );
    });

    it('marks the request failed and rethrows when the queue write fails', async () => {
        const { service, analytics, input } = build({
            addToQueueRejects: true,
        });
        await expect(
            service.request({ ...input, position: 'end' }),
        ).rejects.toThrow('db down');
        expect(analytics.markRequestFailed).toHaveBeenCalledWith('request-id');
    });
});
