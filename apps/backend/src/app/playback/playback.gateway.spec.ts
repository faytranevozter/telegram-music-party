import { PlaybackGateway } from './playback.gateway';
import { PlaybackService } from './playback.service';
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
        gateway = new PlaybackGateway({} as PlaybackService);
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
        gateway = new PlaybackGateway({} as PlaybackService);
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
    let service: {
        getRoom: jest.Mock;
        getRoomDevices: jest.Mock;
        getRoomDevice: jest.Mock;
        addDevice: jest.Mock;
        removeDevice: jest.Mock;
        getQueues: jest.Mock;
        sendMessage: jest.Mock;
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
        service = {
            getRoom: jest.fn().mockResolvedValue(room),
            getRoomDevices: jest.fn().mockResolvedValue([]),
            getRoomDevice: jest.fn().mockResolvedValue(null),
            addDevice: jest.fn().mockResolvedValue(undefined),
            removeDevice: jest.fn().mockResolvedValue(undefined),
            getQueues: jest.fn().mockResolvedValue([]),
            sendMessage: jest.fn().mockResolvedValue(undefined),
        };
        gateway = new PlaybackGateway(service as unknown as PlaybackService);
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
    });
});

describe('PlaybackGateway notifications', () => {
    const getRoom = jest.fn();
    const sendPlaybackNotification = jest.fn();
    const playbackService = {
        getRoom,
        sendPlaybackNotification,
    } as unknown as PlaybackService;
    let gateway: PlaybackGateway;

    beforeEach(() => {
        getRoom.mockReset();
        sendPlaybackNotification.mockReset();
        gateway = new PlaybackGateway(playbackService);
    });

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

        await gateway.onPlaybackNotification(notification);

        expect(sendPlaybackNotification).toHaveBeenCalledWith(
            'chat-id',
            42,
            notification,
        );
    });

    it('does not send notifications for unknown rooms', async () => {
        getRoom.mockResolvedValue(null);

        await gateway.onPlaybackNotification({
            roomId: 'missing-room',
            type: 'queue-empty',
        });

        expect(sendPlaybackNotification).not.toHaveBeenCalled();
    });
});
