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
