import { PrismaService } from 'src/platform/prisma.service';
import { PlaybackService } from './playback.service';

describe('PlaybackService queue cleanup', () => {
    const deleteMany = jest.fn();
    const prisma = {
        queue: { deleteMany },
    } as unknown as PrismaService;
    let service: PlaybackService;

    beforeEach(() => {
        deleteMany.mockReset();
        deleteMany.mockResolvedValue({ count: 0 });
        service = new PlaybackService(prisma);
    });

    it('drops a departed track only up to the moment it started', async () => {
        const startedAt = new Date('2026-01-01T00:00:00.000Z');

        await service.removeQueueBefore('room-id', 'dQw4w9WgXcQ', startedAt);

        expect(deleteMany).toHaveBeenCalledWith({
            where: {
                roomId: 'room-id',
                url: 'dQw4w9WgXcQ',
                createdAt: { lte: startedAt },
            },
        });
    });
});
