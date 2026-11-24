import { Global, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { ENV } from 'src/config/env';
import { PlaybackModule } from 'src/app/playback/playback.module';
import { PlaybackService } from 'src/app/playback/playback.service';
import { QueueRequestService } from 'src/app/playback/core/queue-request.service';
import { TelegramNotifier } from 'src/app/playback/telegram-notifier';
import { WebRoomAccessService } from 'src/app/playback/web/web-room-access.service';
import { PrismaService } from 'src/platform/prisma.service';
import { YTMusicService } from 'src/platform/yt-music.service';
import { KeyvProvider } from 'src/providers/keyv.provider';

@Global()
@Module({
    providers: [PrismaService, KeyvProvider],
    exports: [PrismaService, 'KEYV_CACHE'],
})
class Infrastructure {}

const suite = process.env.WEB_ROOM_E2E === 'true' ? describe : describe.skip;
const song = {
    videoId: 'dQw4w9WgXcQ',
    title: 'Test song',
    artistName: 'Artist',
    channelName: null,
    thumbnailUrl: null,
    durationSeconds: 60,
};

suite('shared web room HTTP and observer contract', () => {
    let app: INestApplication;
    let base: string;
    const roomId = randomUUID();
    const clients: Socket[] = [];

    beforeAll(async () => {
        if (!process.env.DATABASE_URL || !process.env.REDIS_URL)
            throw new Error(
                'Explicit disposable DATABASE_URL and REDIS_URL required',
            );
        if (!ENV.WEB_ROOMS.enabled)
            throw new Error(
                'Enable web rooms and supply disposable storage for this suite',
            );
        const module = await Test.createTestingModule({
            imports: [Infrastructure, PlaybackModule],
        })
            .overrideProvider(YTMusicService)
            .useValue({ searchSongs: () => Promise.resolve([song]) })
            .overrideProvider(TelegramNotifier)
            .useValue({ sendMessage: jest.fn() })
            .compile();
        app = module.createNestApplication();
        await app.listen(0, '127.0.0.1');
        base = await app.getUrl();
        const playback = app.get(PlaybackService);
        await playback.addRoom(roomId, `test-${roomId}`, 42, 'Shared room');
        await playback.setFeature(roomId, 'nextCommand', true);
    });

    afterAll(async () => {
        for (const client of clients) client.disconnect();
        if (!app) return;
        const prisma = app.get(PrismaService);
        const cache = app.get<Keyv>('KEYV_CACHE');
        await prisma.room.deleteMany({ where: { id: roomId } });
        await app.close();
        await cache.disconnect();
        await prisma.$disconnect();
    });

    function route(
        path: string,
        body?: object,
        token?: string,
        origin?: string,
    ) {
        return fetch(`${base}/api/web/v1/${path}`, {
            method: body ? 'POST' : 'GET',
            headers: {
                ...(body ? { 'content-type': 'application/json' } : {}),
                ...(token ? { authorization: `Bearer ${token}` } : {}),
                ...(origin ? { origin } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
    }

    function event<T>(
        socket: Socket,
        name: string,
        accept: (value: T) => boolean = () => true,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                socket.off(name, receive);
                reject(new Error(`Missing event ${name}`));
            }, 3000);
            function receive(value: T) {
                if (!accept(value)) return;
                clearTimeout(timer);
                socket.off(name, receive);
                resolve(value);
            }
            socket.on(name, receive);
        });
    }

    beforeEach(async () => {
        // Only the disposable test server's entry budget is reset; production
        // and other Redis keys are never touched.
        const store = app.get<Keyv>('KEYV_CACHE').store as KeyvRedis<unknown>;
        const digest = createHash('sha256').update('127.0.0.1').digest('hex');
        await store.client.del(`ytparty:web-limit:entry:${digest}`);
    });

    it('shares requests with Telegram and streams player state until the invite is rotated', async () => {
        const access = app.get(WebRoomAccessService);
        const origin = ENV.WEB_ROOMS.enabled ? ENV.WEB_ROOMS.origin : '';
        const shareCode = await access.setInvite(roomId, 'enable');
        const join = await route(
            'rooms/join',
            { shareCode, nickname: 'Guest' },
            undefined,
            origin,
        );
        expect(join.status).toBe(201);
        expect(join.headers.get('access-control-allow-origin')).toBe(origin);
        const { token } = (await join.json()) as { token: string };
        expect(
            (await route('room', undefined, token, 'https://other.example'))
                .status,
        ).toBe(403);
        expect(
            (await route('room/control', { action: 'next' }, token)).status,
        ).toBe(403);
        expect((await route('room/setup', undefined, token)).status).toBe(403);
        const invalid = io(`${base}/web-room`, {
            auth: { token: 'invalid' },
            extraHeaders: { Origin: origin },
            transports: ['websocket'],
            autoConnect: false,
            reconnection: false,
        });
        clients.push(invalid);
        const denied = event(invalid, 'connect_error');
        invalid.connect();
        await denied;
        const observer = io(`${base}/web-room`, {
            auth: { token },
            extraHeaders: { Origin: origin },
            transports: ['websocket'],
            autoConnect: false,
            reconnection: false,
        });
        clients.push(observer);
        const playerOnly = jest.fn();
        observer.on('addToQueue', playerOnly);
        type State = {
            playerOnline: boolean;
            queue: unknown[];
            nowPlaying: { title: string } | null;
        };
        const starting = event<State>(observer, 'room:state');
        observer.connect();
        expect(await starting).toMatchObject({
            playerOnline: false,
            queue: [],
        });
        const player = io(base, {
            transports: ['websocket'],
            autoConnect: false,
            reconnection: false,
        });
        clients.push(player);
        const admitted = event(player, 'joined');
        const online = event<State>(
            observer,
            'room:state',
            (state) => state.playerOnline,
        );
        player.connect().emit('join', {
            id: roomId,
            fingerprint: 'integration-player',
            browser: 'Test',
        });
        await admitted;
        await online;
        player.on('get-player-queue', (reply: (value: unknown) => void) => reply({
            available: true,
            items: [
                { url: 'history', title: 'Earlier track', artist: '', current: false },
                { url: 'current', title: 'Current track', artist: '', current: true },
                { url: 'recommendation', title: 'Recommended track', artist: 'Artist', current: false },
            ],
        }));
        expect((await route('room/autoplay')).status).toBe(401);
        const preview = await route('room/autoplay', undefined, token);
        expect(preview.status).toBe(200);
        expect(await preview.json()).toEqual({ status: 'ok', tracks: [{ videoId: 'recommendation', title: 'Recommended track', artist: 'Artist' }] });
        const search = await route(
            'room/search',
            { query: 'test song' },
            token,
        );
        expect(search.status).toBe(201);
        const [selection] = (await search.json()) as { selectionId: string }[];
        const second = await route('rooms/join', {
            shareCode,
            nickname: 'Other',
        });
        const { token: other } = (await second.json()) as { token: string };
        expect(
            (
                await route(
                    'room/requests',
                    { selectionId: selection.selectionId, position: 'end' },
                    other,
                )
            ).status,
        ).toBe(404);
        const playerRequest = event(player, 'addToQueue');
        const queued = event<State>(
            observer,
            'room:state',
            (state) => state.queue.length === 1,
        );
        await app.get(PlaybackService).setFeature(roomId, 'maxQueueSize', 1);
        expect(
            (
                await route(
                    'room/requests',
                    { selectionId: selection.selectionId, position: 'end' },
                    token,
                )
            ).status,
        ).toBe(201);
        await playerRequest;
        await queued;
        expect(playerOnly).not.toHaveBeenCalled();
        const playback = app.get(PlaybackService);
        const telegramRoom = await playback.getRoomByChatId(
            `test-${roomId}`,
            42,
        );
        expect(await playback.getQueues(telegramRoom!.id)).toMatchObject([
            { url: song.videoId },
        ]);
        const queueService = app.get(QueueRequestService);
        await playback.setFeature(roomId, 'maxQueueSize', 2);
        const room = (await playback.getRoomWithFeatures(roomId))!;
        const telegramActor = {
            userRef: 'telegram:42',
            displayName: 'Test',
            source: 'telegram' as const,
            isAdmin: () => Promise.resolve(false),
        };
        const before = await route(
            'room/search',
            { query: 'test song' },
            token,
        );
        expect(before.status).toBe(201);
        const [webSelection] = (await before.json()) as {
            selectionId: string;
        }[];
        // Two distinct tracks vie for the final slot through the same core.
        await playback.removeQueue(roomId, song.videoId);
        await playback.addToQueue(roomId, 'filler', 'Existing song');
        const telegramSong = { ...song, videoId: 'abcdefghijk' };
        const [telegram, web] = await Promise.all([
            queueService.request({
                room,
                actor: telegramActor,
                position: 'end',
                videoId: telegramSong.videoId,
                loadSong: () => Promise.resolve(telegramSong),
            }),
            route(
                'room/requests',
                { selectionId: webSelection.selectionId, position: 'end' },
                token,
            ),
        ]);
        if (telegram.status === 'added') {
            expect(web.status).toBe(409);
            expect(await web.json()).toEqual({ status: 'queue-full' });
        } else {
            expect(telegram.status).toBe('queue-full');
            expect(web.status).toBe(201);
        }
        expect(await playback.getQueues(roomId)).toHaveLength(2);
        expect(
            await app.get(PrismaService).songRequest.findFirst({
                where: { roomId, videoId: song.videoId },
            }),
        ).toMatchObject({
            requesterId: expect.stringMatching(/^web:/) as unknown,
        });
        const observedTrack = event<State>(
            observer,
            'room:state',
            (state) => state.nowPlaying?.title === song.title,
        );
        player.emit('playback-report', {
            roomId,
            playbackId: 'test-play',
            videoId: song.videoId,
            title: song.title,
            artist: 'Artist',
            source: 'requested',
            event: 'start',
            startedAt: new Date().toISOString(),
            listenedMs: 0,
        });
        await observedTrack;
        const offline = event<State>(
            observer,
            'room:state',
            (state) => !state.playerOnline,
        );
        player.disconnect();
        expect(await offline).toMatchObject({ nowPlaying: null });
        const disconnected = event(observer, 'disconnect');
        await access.setInvite(roomId, 'rotate');
        await disconnected;
        expect((await route('room', undefined, token)).status).toBe(401);
        expect((await route('room/autoplay', undefined, token)).status).toBe(401);
    }, 15_000);

    it('publishes host settings changes to guests and enforces video search', async () => {
        const created = await route('rooms', { name: 'Settings room', nickname: 'Host' });
        const { token: owner, roomId: id, shareCode } = (await created.json()) as { token: string; roomId: string; shareCode: string };
        try {
            const joined = await route('rooms/join', { shareCode, nickname: 'Guest' });
            const { token: guest } = (await joined.json()) as { token: string };
            const ownerState = await (await route('room', undefined, owner)).json() as { capabilities: { controls: string[] } };
            const guestState = await (await route('room', undefined, guest)).json() as { capabilities: { controls: string[] } };
            expect(ownerState.capabilities.controls).toEqual(expect.arrayContaining(['next', 'previous']));
            expect(guestState.capabilities.controls).not.toEqual(expect.arrayContaining(['next']));
            expect(guestState.capabilities.controls).not.toEqual(expect.arrayContaining(['previous']));
            for (const action of ['next', 'previous']) {
                expect((await route('room/control', { action }, guest)).status).toBe(403);
                expect((await route('room/control', { action }, owner)).status).toBe(409);
            }
            const origin = ENV.WEB_ROOMS.enabled ? ENV.WEB_ROOMS.origin : '';
            const observer = io(`${base}/web-room`, { auth: { token: guest }, extraHeaders: { Origin: origin }, autoConnect: false, transports: ['websocket'], reconnection: false });
            clients.push(observer);
            const initial = event(observer, 'room:state');
            observer.connect();
            await initial;
            type State = { capabilities: { playNext: boolean; videoSearch: boolean } };
            const enabled = event<State>(observer, 'room:state', (state) => state.capabilities.videoSearch && state.capabilities.playNext);
            expect((await route('room/settings', { allowVideoSearch: true, playNextCommand: true }, owner)).status).toBe(201);
            expect(await enabled).not.toHaveProperty('settings');
            const search = await route('room/search', { query: 'test song' }, guest);
            const [selection] = (await search.json()) as { selectionId: string }[];
            const playback = app.get(PlaybackService);
            await playback.addToQueue(id, 'existing', 'Existing');
            await playback.addVote(id, 'web:existing');
            const disabled = event<State>(observer, 'room:state', (state) => !state.capabilities.videoSearch && !state.capabilities.playNext);
            expect((await route('room/settings', { allowVideoSearch: false, playNextCommand: false, maxQueueSize: 1 }, owner)).status).toBe(201);
            await disabled;
            expect((await route('room/search', { query: 'test song', type: 'video' }, guest)).status).toBe(403);
            expect((await route('room/requests', { selectionId: selection.selectionId, position: 'next' }, guest)).status).toBe(403);
            expect((await route('room/requests', { selectionId: selection.selectionId, position: 'end' }, guest)).status).toBe(409);
            expect(await playback.getQueues(id)).toHaveLength(1);
            expect(await playback.countVotes(id)).toBe(1);
            expect(await (await route('room/settings', undefined, owner)).json()).toMatchObject({ maxQueueSize: 1, playNextCommand: false, allowVideoSearch: false });
            expect((await route('room/settings', undefined, guest)).status).toBe(403);
            const reenabled = event<State>(observer, 'room:state', (state) => state.capabilities.videoSearch && state.capabilities.playNext);
            expect((await route('room/settings', { allowVideoSearch: true, playNextCommand: true }, owner)).status).toBe(201);
            await reenabled;
            await playback.removeQueue(id, 'existing');
            expect((await route('room/settings', { dailyPlayNextLimit: 1 }, owner)).status).toBe(201);
            expect((await route('room/requests', { selectionId: selection.selectionId, position: 'next' }, guest)).status).toBe(201);
            await playback.removeQueue(id, song.videoId);
            const quota = await route('room/requests', { selectionId: selection.selectionId, position: 'next' }, guest);
            expect(quota.status).toBe(409);
            expect(await quota.json()).toMatchObject({ status: 'limit-reached' });
        } finally { await app.get(PlaybackService).removeRoom(id); }
    }, 15000);

    it('creates a web-only owner and throttles concurrent entry requests in Redis', async () => {
        const created = await route('rooms', {
            name: 'Web only',
            nickname: 'Owner',
        });
        expect(created.status).toBe(201);
        const { token, roomId: id } = (await created.json()) as {
            token: string;
            roomId: string;
        };
        try {
            const setup = await route('room/setup', undefined, token);
            expect(setup.status).toBe(200);
            expect(await setup.json()).toMatchObject({ roomId: id });
            expect(
                (await route('room/control', { action: 'play' }, token)).status,
            ).toBe(409);
            const results = await Promise.all(
                Array.from({ length: 11 }, () =>
                    route('rooms/join', {
                        shareCode: 'a'.repeat(32),
                        nickname: 'Test',
                    }),
                ),
            );
            const statuses = results.map((response) => response.status);
            expect(statuses.filter((status) => status === 404)).toHaveLength(9);
            expect(statuses.filter((status) => status === 429)).toHaveLength(2);
            expect(
                statuses.every((status) => status === 404 || status === 429),
            ).toBe(true);
        } finally {
            await app.get(PlaybackService).removeRoom(id);
        }
    });
});
