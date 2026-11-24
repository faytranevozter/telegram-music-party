import { expect, it, vi } from 'vitest';
import { ApiError, type Selection } from './api';
import { queueSelection } from './queue-selection';

const track = { selectionId: 'old', videoId: 'same-track', title: 'Song' } as Selection;

it('refreshes an expired selection and retries the exact track and position once', async () => {
    const queue = vi.fn().mockRejectedValueOnce(new ApiError(404, 'selection-not-found')).mockResolvedValue(undefined);
    const search = vi.fn().mockResolvedValue([{ ...track, videoId: 'other' }, { ...track, selectionId: 'fresh' }]);
    await queueSelection({ queue, search }, 'session', track, 'next', { query: 'original query', type: 'video' });
    expect(search).toHaveBeenCalledWith('session', 'original query', 'video', undefined);
    expect(queue.mock.calls).toEqual([['session', 'old', 'next'], ['session', 'fresh', 'next']]);
});

it.each([new ApiError(404), new ApiError(409, 'queue-full'), new Error('network')])('does not retry ambiguous or unrelated failures: %s', async (error) => {
    const queue = vi.fn().mockRejectedValue(error);
    const search = vi.fn();
    await expect(queueSelection({ queue, search }, 'session', track, 'end', { query: 'Song', type: 'song' })).rejects.toBe(error);
    expect(search).not.toHaveBeenCalled();
});

it('does not substitute another track when the result disappears', async () => {
    const queue = vi.fn().mockRejectedValue(new ApiError(404, 'selection-not-found'));
    const search = vi.fn().mockResolvedValue([{ ...track, videoId: 'other' }]);
    await expect(queueSelection({ queue, search }, 'session', track, 'end', { query: 'Song', type: 'song' })).rejects.toMatchObject({ status: 'track-unavailable' });
    expect(queue).toHaveBeenCalledTimes(1);
});
