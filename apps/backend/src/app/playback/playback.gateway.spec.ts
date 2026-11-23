import { PlaybackGateway } from './playback.gateway';
import { PlaybackService } from './playback.service';
import { TelegramNotifier } from './telegram-notifier';
import type { AnalyticsService } from 'src/app/analytics/analytics.service';
import type { Server } from 'socket.io';

describe('PlaybackGateway player queue', () => {
    const fetchSockets = jest.fn();
    const emitWithAck = jest.fn();
    const timeout = jest.fn(() => ({ emitWithAck }));
    const to = jest.fn(() => ({ timeout }));
    const inRoom = jest.fn(() => ({ fetchSockets }));
    let gateway: PlaybackGateway;

    beforeEach(() => {
        jest.clearAllMocks();
        gateway = new PlaybackGateway(
            {} as PlaybackService,
            {} as AnalyticsService,
            {} as TelegramNotifier,
        );
        gateway.wss = {
            in: inRoom,
            to,
        } as unknown as Server;
        fetchSockets.mockResolvedValue([{ id: 'player' }]);
    });

    it('requests a fresh snapshot from only the room player', async () => {
        emitWithAck.mockResolvedValue([{ available: true, items: [] }]);
        expect(await gateway.getPlayerQueue('room')).toEqual({
            status: 'ok',
            items: [],
        });
        expect(inRoom).toHaveBeenCalledWith('room');
        expect(to).toHaveBeenCalledWith('player');
        expect(timeout).toHaveBeenCalledWith(5000);
        expect(emitWithAck).toHaveBeenCalledWith('get-player-queue');
    });

    it('reports disconnected players without requesting a snapshot', async () => {
        fetchSockets.mockResolvedValue([]);
        expect(await gateway.getPlayerQueue('room')).toEqual({
            status: 'offline',
        });
        expect(to).not.toHaveBeenCalled();
    });

    it('reports a bounded request timeout', async () => {
        emitWithAck.mockRejectedValue(new Error('timeout'));
        expect(await gateway.getPlayerQueue('room')).toEqual({
            status: 'timeout',
        });
    });

    it('discards snapshots from a replaced player', async () => {
        fetchSockets
            .mockResolvedValueOnce([{ id: 'player' }])
            .mockResolvedValueOnce([{ id: 'replacement' }]);
        emitWithAck.mockResolvedValue([{ available: true, items: [] }]);
        expect(await gateway.getPlayerQueue('room')).toEqual({
            status: 'offline',
        });
    });
});

describe('PlaybackGateway autoplay commands', () => {
    const fetchSockets = jest.fn();
    const emitWithAck = jest.fn();
    const timeout = jest.fn(() => ({ emitWithAck }));
    const to = jest.fn(() => ({ timeout }));
    const inRoom = jest.fn(() => ({ fetchSockets }));
    let gateway: PlaybackGateway;

    beforeEach(() => {
        jest.clearAllMocks();
        gateway = new PlaybackGateway(
            {} as PlaybackService,
            {} as AnalyticsService,
            {} as TelegramNotifier,
        );
        gateway.wss = {
            in: inRoom,
            to,
        } as unknown as Server;
        fetchSockets.mockResolvedValue([{ id: 'player' }]);
    });

    it('asks only the room player to start the current song radio', async () => {
        emitWithAck.mockResolvedValue([
            {
                status: 'ok',
                videoId: 'dQw4w9WgXcQ',
                song: 'Never Gonna Give You Up',
                artist: 'Rick Astley',
            },
        ]);

        expect(await gateway.startRadio('room')).toEqual({
            status: 'ok',
            videoId: 'dQw4w9WgXcQ',
            song: 'Never Gonna Give You Up',
            artist: 'Rick Astley',
        });
        expect(inRoom).toHaveBeenCalledWith('room');
        expect(to).toHaveBeenCalledWith('player');
        expect(timeout).toHaveBeenCalledWith(10000);
        expect(emitWithAck).toHaveBeenCalledWith('start-radio');
    });

    it('asks only the room player to rebuild its autoplay queue', async () => {
        emitWithAck.mockResolvedValue([
            {
                status: 'ok',
                videoId: 'dQw4w9WgXcQ',
                song: 'Never Gonna Give You Up',
                artist: 'Rick Astley',
            },
        ]);

        expect(await gateway.refreshAutoplay('room')).toEqual({
            status: 'ok',
            videoId: 'dQw4w9WgXcQ',
            song: 'Never Gonna Give You Up',
            artist: 'Rick Astley',
        });
        expect(inRoom).toHaveBeenCalledWith('room');
        expect(to).toHaveBeenCalledWith('player');
        expect(timeout).toHaveBeenCalledWith(10000);
        expect(emitWithAck).toHaveBeenCalledWith('refresh-autoplay');
    });

    it('returns player-reported refresh failures', async () => {
        emitWithAck.mockResolvedValue([{ status: 'no-current-song' }]);
        expect(await gateway.refreshAutoplay('room')).toEqual({
            status: 'no-current-song',
        });
    });

    it('rejects malformed player responses', async () => {
        emitWithAck.mockResolvedValue([{ status: 'ok', videoId: '' }]);
        expect(await gateway.refreshAutoplay('room')).toEqual({
            status: 'unavailable',
        });
    });

    it('reports disconnected players without sending a request', async () => {
        fetchSockets.mockResolvedValue([]);
        expect(await gateway.refreshAutoplay('room')).toEqual({
            status: 'offline',
        });
        expect(to).not.toHaveBeenCalled();
    });

    it('reports a bounded request timeout', async () => {
        emitWithAck.mockRejectedValue(new Error('timeout'));
        expect(await gateway.refreshAutoplay('room')).toEqual({
            status: 'timeout',
        });
    });

    it('discards responses from a replaced player', async () => {
        fetchSockets
            .mockResolvedValueOnce([{ id: 'player' }])
            .mockResolvedValueOnce([{ id: 'replacement' }]);
        emitWithAck.mockResolvedValue([
            {
                status: 'ok',
                videoId: 'dQw4w9WgXcQ',
                song: 'Song',
                artist: 'Artist',
            },
        ]);
        expect(await gateway.refreshAutoplay('room')).toEqual({
            status: 'offline',
        });
    });
});

describe('PlaybackGateway room admission', () => {
    const room = { id: 'room', chatId: 'chat', threadId: null };
    let gateway: PlaybackGateway;
    let analytics: { closeRoomSessions: jest.Mock };
    let notifier: {
        sendMessage: jest.Mock;
        sendPlaybackNotification: jest.Mock;
    };
    let service: {
        getRoom: jest.Mock;
        getRoomDevices: jest.Mock;
        getRoomDevice: jest.Mock;
        addDevice: jest.Mock;
        removeDevice: jest.Mock;
        getQueues: jest.Mock;
    };

    function makeSocket(id = 'socket-1') {
        const socket = {
            id,
            data: {} as Record<string, unknown>,
            emit: jest.fn(),
            join: jest.fn(),
            leave: jest.fn(),
        };
        return socket as unknown as {
            id: string;
            data: Record<string, unknown>;
            emit: jest.Mock;
            join: jest.Mock;
            leave: jest.Mock;
        };
    }

    beforeEach(() => {
        analytics = {
            closeRoomSessions: jest.fn().mockResolvedValue(undefined),
        };
        service = {
            getRoom: jest.fn().mockResolvedValue(room),
            getRoomDevices: jest.fn().mockResolvedValue([]),
            getRoomDevice: jest.fn().mockResolvedValue(null),
            addDevice: jest.fn().mockResolvedValue(undefined),
            removeDevice: jest.fn().mockResolvedValue(undefined),
            getQueues: jest.fn().mockResolvedValue([]),
        };
        notifier = {
            sendMessage: jest.fn().mockResolvedValue(undefined),
            sendPlaybackNotification: jest.fn().mockResolvedValue(undefined),
        };
        gateway = new PlaybackGateway(
            service as unknown as PlaybackService,
            analytics as unknown as AnalyticsService,
            notifier as unknown as TelegramNotifier,
        );
        gateway.wss = {
            in: jest.fn(() => ({
                fetchSockets: jest.fn().mockResolvedValue([]),
            })),
        } as unknown as Server;
    });

    it('rejects a join when a different device already occupies the room', async () => {
        service.getRoomDevices.mockResolvedValue([
            { id: 'd1', name: 'Other', fingerprint: 'other' },
        ]);
        const socket = makeSocket();

        await gateway.onJoin(socket as never, {
            id: 'room',
            browser: 'Chrome',
            fingerprint: 'mine',
        });

        expect(socket.emit).toHaveBeenCalledWith('join-rejected', {
            reason: 'room-busy',
        });
        expect(socket.join).not.toHaveBeenCalled();
        expect(service.addDevice).not.toHaveBeenCalled();
    });

    it('allows the same fingerprint to reconnect', async () => {
        service.getRoomDevices.mockResolvedValue([
            { id: 'd1', name: 'Mine', fingerprint: 'mine' },
        ]);
        service.getRoomDevice.mockResolvedValue({
            id: 'd1',
            name: 'Mine',
            fingerprint: 'mine',
        });
        const socket = makeSocket();

        await gateway.onJoin(socket as never, {
            id: 'room',
            browser: 'Chrome',
            fingerprint: 'mine',
        });

        expect(socket.emit).toHaveBeenCalledWith('joined', []);
        expect(socket.join).toHaveBeenCalledWith('room');
        expect(service.addDevice).not.toHaveBeenCalled();
    });

    it('admits the first player into an empty room', async () => {
        const socket = makeSocket();

        await gateway.onJoin(socket as never, {
            id: 'room',
            browser: 'Chrome',
            fingerprint: 'mine',
        });

        expect(service.addDevice).toHaveBeenCalledWith(
            'room',
            'mine',
            'Chrome',
        );
        expect(socket.join).toHaveBeenCalledWith('room');
        expect(socket.emit).toHaveBeenCalledWith('joined', []);
        expect(socket.data.session).toEqual({
            roomId: 'room',
            fingerprint: 'mine',
        });
    });

    it('announces a new player in the room chat', async () => {
        const socket = makeSocket();

        await gateway.onJoin(socket as never, {
            id: 'room',
            browser: 'Chrome',
            fingerprint: 'mine',
        });

        expect(notifier.sendMessage).toHaveBeenCalledWith(
            'chat',
            null,
            'Chrome joined',
        );
    });

    it('stays silent when the room has no Telegram chat', async () => {
        service.getRoom.mockResolvedValue({
            id: 'room',
            chatId: '',
            threadId: null,
        });
        const socket = makeSocket();

        await gateway.onJoin(socket as never, {
            id: 'room',
            browser: 'Chrome',
            fingerprint: 'mine',
        });

        expect(notifier.sendMessage).not.toHaveBeenCalled();
        expect(socket.emit).toHaveBeenCalledWith('joined', []);
    });

    it('frees the room when the owning socket disconnects', async () => {
        service.getRoomDevice.mockResolvedValue({
            id: 'd1',
            name: 'Mine',
            fingerprint: 'mine',
        });
        const socket = makeSocket();
        socket.data.session = { roomId: 'room', fingerprint: 'mine' };

        await gateway.handleDisconnect(socket as never);

        expect(service.removeDevice).toHaveBeenCalledWith('room', 'mine');
        expect(analytics.closeRoomSessions).toHaveBeenCalledWith(
            'room',
            'interrupted',
        );
    });

    it('does not free the room when the same device reconnected elsewhere', async () => {
        service.getRoomDevice.mockResolvedValue({
            id: 'd1',
            name: 'Mine',
            fingerprint: 'mine',
        });
        gateway.wss = {
            in: jest.fn(() => ({
                fetchSockets: jest.fn().mockResolvedValue([
                    {
                        id: 'socket-2',
                        data: { session: { fingerprint: 'mine' } },
                    },
                ]),
            })),
        } as unknown as Server;
        const socket = makeSocket('socket-1');
        socket.data.session = { roomId: 'room', fingerprint: 'mine' };

        await gateway.handleDisconnect(socket as never);

        expect(service.removeDevice).not.toHaveBeenCalled();
    });

    it('leaves the socket room on explicit leave', async () => {
        service.getRoomDevice.mockResolvedValue({
            id: 'd1',
            name: 'Mine',
            fingerprint: 'mine',
            room,
        });
        const socket = makeSocket();

        await gateway.onLeave(socket as never, {
            roomId: 'room',
            fingerprint: 'mine',
        });

        expect(socket.leave).toHaveBeenCalledWith('room');
        expect(service.removeDevice).toHaveBeenCalledWith('room', 'mine');
        expect(analytics.closeRoomSessions).toHaveBeenCalledWith(
            'room',
            'interrupted',
        );
    });
});

describe('PlaybackGateway playback reports', () => {
    const getRoomDevice = jest.fn();
    const recordPlayback = jest.fn();
    const sendPlaybackNotification = jest.fn();
    const notifier = {
        sendPlaybackNotification,
    } as unknown as TelegramNotifier;
    let gateway: PlaybackGateway;

    const report = () => ({
        roomId: 'room',
        playbackId: 'playback-1',
        videoId: 'dQw4w9WgXcQ',
        title: 'Song',
        artist: 'Artist',
        durationMs: 200_000,
        source: 'requested' as const,
        event: 'start' as const,
        startedAt: new Date().toISOString(),
        listenedMs: 0,
    });

    function makeSocket(inRoom = true) {
        return {
            id: 'socket-1',
            data: { session: { roomId: 'room', fingerprint: 'device-1' } },
            rooms: new Set(inRoom ? ['room'] : []),
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        getRoomDevice.mockResolvedValue({
            id: 'device',
            fingerprint: 'device-1',
        });
        recordPlayback.mockResolvedValue(undefined);
        gateway = new PlaybackGateway(
            {
                getRoomDevice,
            } as unknown as PlaybackService,
            { recordPlayback } as unknown as AnalyticsService,
            notifier,
        );
    });

    it('records reports from the admitted device in the room', async () => {
        await gateway.onPlaybackReport(makeSocket() as never, report());
        expect(getRoomDevice).toHaveBeenCalledWith('room', 'device-1');
        expect(recordPlayback).toHaveBeenCalledWith(
            expect.objectContaining({
                playbackId: 'playback-1',
                roomId: 'room',
            }),
        );
        // Analytics is independent of Telegram notifications.
        expect(sendPlaybackNotification).not.toHaveBeenCalled();
    });

    it('ignores sockets that are not in the room channel', async () => {
        await gateway.onPlaybackReport(makeSocket(false) as never, report());
        expect(recordPlayback).not.toHaveBeenCalled();
    });

    it('ignores devices that are no longer admitted', async () => {
        getRoomDevice.mockResolvedValue(null);
        await gateway.onPlaybackReport(makeSocket() as never, report());
        expect(recordPlayback).not.toHaveBeenCalled();
    });

    it('ignores the old device after another device takes over the room', async () => {
        // The room is now admitted to a different fingerprint; the old socket
        // may still be connected and buffering reports.
        getRoomDevice.mockResolvedValue(null);
        await gateway.onPlaybackReport(makeSocket() as never, {
            ...report(),
            playbackId: 'old-playback',
        });
        expect(getRoomDevice).toHaveBeenCalledWith('room', 'device-1');
        expect(recordPlayback).not.toHaveBeenCalled();
    });

    it('ignores reports for a different room', async () => {
        await gateway.onPlaybackReport(makeSocket() as never, {
            ...report(),
            roomId: 'other-room',
        });
        expect(recordPlayback).not.toHaveBeenCalled();
    });

    it('ignores malformed reports before querying admission', async () => {
        await gateway.onPlaybackReport(makeSocket() as never, {
            ...report(),
            videoId: '',
        });
        expect(getRoomDevice).not.toHaveBeenCalled();
        expect(recordPlayback).not.toHaveBeenCalled();
    });
});

describe('PlaybackGateway song starts', () => {
    const getRoom = jest.fn();
    const removeQueue = jest.fn();
    const removeQueueBefore = jest.fn();
    const removeRoomVotes = jest.fn();
    let gateway: PlaybackGateway;

    beforeEach(() => {
        jest.clearAllMocks();
        getRoom.mockResolvedValue({ id: 'room-id' });
        removeQueue.mockResolvedValue(undefined);
        removeQueueBefore.mockResolvedValue(undefined);
        removeRoomVotes.mockResolvedValue(undefined);
        gateway = new PlaybackGateway(
            {
                getRoom,
                removeQueue,
                removeQueueBefore,
                removeRoomVotes,
            } as unknown as PlaybackService,
            {} as AnalyticsService,
            {} as TelegramNotifier,
        );
    });

    it('clears the started track and the one it replaced', async () => {
        await gateway.onStartedNewSong({ roomId: 'room-id', videoId: 'first' });
        await gateway.onStartedNewSong({
            roomId: 'room-id',
            videoId: 'second',
        });

        expect(removeQueue).toHaveBeenLastCalledWith('room-id', 'second');
        expect(removeQueueBefore).toHaveBeenCalledTimes(1);
        expect(removeQueueBefore).toHaveBeenCalledWith(
            'room-id',
            'first',
            expect.any(Date),
        );
        expect(removeRoomVotes).toHaveBeenCalledTimes(2);
    });

    it('never deletes a repeat through the previous-track path', async () => {
        await gateway.onStartedNewSong({ roomId: 'room-id', videoId: 'song' });
        await gateway.onStartedNewSong({ roomId: 'room-id', videoId: 'song' });

        expect(removeQueueBefore).not.toHaveBeenCalled();
    });

    it('ignores starts reported for unknown rooms', async () => {
        getRoom.mockResolvedValue(null);

        await gateway.onStartedNewSong({
            roomId: 'missing-room',
            videoId: 'song',
        });

        expect(removeQueue).not.toHaveBeenCalled();
        expect(removeRoomVotes).not.toHaveBeenCalled();
    });
});

describe('PlaybackGateway notifications', () => {
    const getRoom = jest.fn();
    const sendPlaybackNotification = jest.fn();
    const removeQueue = jest.fn();
    const playbackService = {
        getRoom,
        removeQueue,
    } as unknown as PlaybackService;
    const notifier = {
        sendPlaybackNotification,
    } as unknown as TelegramNotifier;
    let gateway: PlaybackGateway;

    beforeEach(() => {
        getRoom.mockReset();
        sendPlaybackNotification.mockReset();
        removeQueue.mockReset();
        removeQueue.mockResolvedValue(undefined);
        gateway = new PlaybackGateway(
            playbackService,
            {} as AnalyticsService,
            notifier,
        );
    });

    /** The admitted player socket, as the gateway records it on join. */
    function makeSocket(inRoom = true) {
        return {
            id: 'socket-1',
            data: { session: { roomId: 'room-id', fingerprint: 'device-1' } },
            rooms: new Set(inRoom ? ['room-id'] : []),
        };
    }

    it('routes typed notifications through the room Telegram chat', async () => {
        getRoom.mockResolvedValue({
            id: 'room-id',
            chatId: 'chat-id',
            threadId: 42,
        });
        const notification = {
            roomId: 'room-id',
            type: 'queue-empty' as const,
        };

        await gateway.onPlaybackNotification(
            makeSocket() as never,
            notification,
        );

        expect(sendPlaybackNotification).toHaveBeenCalledWith(
            'chat-id',
            42,
            notification,
        );
    });

    it('does not send notifications for unknown rooms', async () => {
        getRoom.mockResolvedValue(null);

        await gateway.onPlaybackNotification(makeSocket() as never, {
            roomId: 'missing-room',
            type: 'queue-empty',
        });

        expect(sendPlaybackNotification).not.toHaveBeenCalled();
    });

    it('drops a refused track from the room queue before notifying', async () => {
        getRoom.mockResolvedValue({
            id: 'room-id',
            chatId: 'chat-id',
            threadId: 42,
        });

        await gateway.onPlaybackNotification(makeSocket() as never, {
            roomId: 'room-id',
            type: 'queue-unavailable',
            videoId: 'dQw4w9WgXcQ',
            song: 'Title',
        });

        expect(removeQueue).toHaveBeenCalledWith('room-id', 'dQw4w9WgXcQ');
        expect(sendPlaybackNotification).toHaveBeenCalledWith(
            'chat-id',
            42,
            expect.objectContaining({ type: 'queue-unavailable' }),
        );
    });

    it('leaves the room queue alone for other notifications', async () => {
        getRoom.mockResolvedValue({
            id: 'room-id',
            chatId: 'chat-id',
            threadId: null,
        });

        await gateway.onPlaybackNotification(makeSocket() as never, {
            roomId: 'room-id',
            type: 'now-playing',
            song: 'Title',
            artist: 'Artist',
        });

        expect(removeQueue).not.toHaveBeenCalled();
    });

    it('ignores refused tracks from a socket that is not the admitted device', async () => {
        getRoom.mockResolvedValue({
            id: 'room-id',
            chatId: 'chat-id',
            threadId: 42,
        });

        await gateway.onPlaybackNotification(makeSocket(false) as never, {
            roomId: 'room-id',
            type: 'queue-unavailable',
            videoId: 'dQw4w9WgXcQ',
            song: 'Title',
        });

        expect(removeQueue).not.toHaveBeenCalled();
        expect(sendPlaybackNotification).not.toHaveBeenCalled();
    });

    it('sends nothing for a room with no Telegram chat', async () => {
        getRoom.mockResolvedValue({
            id: 'room-id',
            chatId: '',
            threadId: null,
        });

        await gateway.onPlaybackNotification(makeSocket() as never, {
            roomId: 'room-id',
            type: 'now-playing',
            song: 'Title',
            artist: 'Artist',
        });

        expect(sendPlaybackNotification).not.toHaveBeenCalled();
    });

    it('still drops a refused track in a room with no Telegram chat', async () => {
        getRoom.mockResolvedValue({
            id: 'room-id',
            chatId: '',
            threadId: null,
        });

        await gateway.onPlaybackNotification(makeSocket() as never, {
            roomId: 'room-id',
            type: 'queue-unavailable',
            videoId: 'dQw4w9WgXcQ',
            song: 'Title',
        });

        expect(removeQueue).toHaveBeenCalledWith('room-id', 'dQw4w9WgXcQ');
        expect(sendPlaybackNotification).not.toHaveBeenCalled();
    });
});
