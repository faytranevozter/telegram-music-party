import { PlaybackGateway } from './playback.gateway';
import { PlaybackService } from './playback.service';

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
