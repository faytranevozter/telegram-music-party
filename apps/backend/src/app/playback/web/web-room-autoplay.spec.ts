import { WebRoomService } from './web-room.service';
import type { PlayerQueueResult } from 'src/types/playback.type';

const track = (url: string, current = false) => ({ url, title: url, artist: '', current });

function setup(result: PlayerQueueResult) {
    const player = {
        playerOnline: jest.fn().mockResolvedValue(true),
        currentTrack: jest.fn().mockReturnValue(null),
        getPlayerQueue: jest.fn().mockResolvedValue(result),
    };
    const playback = { getQueues: jest.fn().mockResolvedValue([{ url: 'requested' }]) };
    const service = new WebRoomService(null!, null!, playback as never, player as never, null!, null!);
    return { service, player };
}

it('shows the first five upcoming tracks in player order, excluding requests', async () => {
    const { service } = setup({ status: 'ok', items: [track('history'), track('current', true), track('requested'), { ...track('a'), durationSeconds: 292 }, ...['b', 'c', 'd', 'e', 'f'].map((id) => track(id))] });
    const result = await service.autoplay('room');
    expect(result).toEqual({ status: 'ok', tracks: [{ videoId: 'a', title: 'a', artist: '', durationSeconds: 292 }, ...['b', 'c', 'd', 'e'].map((id) => ({ videoId: id, title: id, artist: '' }))] });
});

it('shares concurrent reads only within a room and does not cache results', async () => {
    const { service, player } = setup({ status: 'ok', items: [] });
    await expect(Promise.all([service.autoplay('a'), service.autoplay('a'), service.autoplay('b')])).resolves.toEqual(Array(3).fill({ status: 'ok', tracks: [] }));
    expect(player.getPlayerQueue.mock.calls).toEqual([['a'], ['b']]);
    await service.autoplay('a');
    expect(player.getPlayerQueue).toHaveBeenCalledTimes(3);
});

it('does not guess where history ends or read an offline player', async () => {
    const { service, player } = setup({ status: 'ok', items: [track('old'), track('anchor'), track('next')] });
    await expect(service.autoplay('room')).resolves.toEqual({ status: 'unavailable' });
    player.currentTrack.mockReturnValue({ videoId: 'anchor' });
    await expect(service.autoplay('room')).resolves.toMatchObject({ status: 'ok', tracks: [{ videoId: 'next' }] });
    player.getPlayerQueue.mockResolvedValueOnce({ status: 'timeout' });
    await expect(service.autoplay('room')).resolves.toEqual({ status: 'timeout' });
    player.playerOnline.mockResolvedValue(false);
    await expect(service.autoplay('room')).resolves.toEqual({ status: 'offline' });
    expect(player.getPlayerQueue).toHaveBeenCalledTimes(3);
});
