import { requesterLabel, snapshotRequesterName } from './requester-display';

it.each([
    ['hidden', 'Alex', undefined],
    ['anonymous', 'Alex', 'Anonymous'],
    ['anonymous', null, 'Anonymous'],
    ['name', 'Alex', 'Alex'],
    ['name', null, undefined],
    ['invalid', 'Alex', undefined],
])('projects %s without leaking the stored name', (mode, name, label) => {
    expect(requesterLabel(mode, name)).toBe(label);
});

it('removes controls and bounds a request-time name by code points', () => {
    expect(snapshotRequesterName(` \u0000${'🎵'.repeat(90)} `)).toBe('🎵'.repeat(80));
    expect(snapshotRequesterName(' \u0000 ')).toBeNull();
});
