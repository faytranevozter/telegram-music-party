import { expect, it } from 'vitest';
import { coverSources, formatTrackDuration, queueTrackDisplay } from './track-art';

it('displays queue labels as title and details without requiring new API fields', () => {
    expect(queueTrackDisplay('Dreams - Fleetwood Mac [4:17]')).toEqual({ title: 'Dreams', detail: 'Fleetwood Mac · 4:17' });
    expect(queueTrackDisplay('Song - Remix - Artist [Duration unavailable]')).toEqual({ title: 'Song - Remix', detail: 'Artist' });
    expect(queueTrackDisplay('Song - Remix')).toEqual({ title: 'Song - Remix' });
});

it('prefers provider art and falls back to the video thumbnail', () => {
    const album = 'https://lh3.googleusercontent.com/album';
    expect(coverSources('lYBUbBu4W08', album)).toEqual([
        album, 'https://i.ytimg.com/vi/lYBUbBu4W08/mqdefault.jpg',
    ]);
});

it('uses a placeholder when there is no usable artwork source', () => {
    expect(coverSources('not/a/video', 'http://example.com/cover')).toEqual([]);
    expect(coverSources(undefined, null)).toEqual([]);
});

it('formats known track lengths but does not invent missing durations', () => {
    expect(formatTrackDuration(214)).toBe('3:34');
    expect(formatTrackDuration(3601)).toBe('1:00:01');
    expect(formatTrackDuration(null)).toBeNull();
    expect(formatTrackDuration(-1)).toBeNull();
});
