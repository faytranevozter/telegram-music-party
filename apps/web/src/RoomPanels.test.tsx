// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { QueueTrackList } from './RoomPanels';

it('shows requester labels as plain text only on attributed tracks', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
        await act(async () => root.render(<QueueTrackList label="Playback order" tracks={[
            { key: 'named', title: 'Named request', requesterLabel: 'Alex <b>& friends' },
            { key: 'anonymous', title: 'Anonymous request', requesterLabel: 'Anonymous' },
            { key: 'hidden', title: 'Hidden request' },
            { key: 'autoplay', title: 'Autoplay', detail: 'Artist' },
        ]} />));
        const rows = [...container.querySelectorAll('li')];
        expect(rows[0].textContent).toContain('Requested by Alex <b>& friends');
        expect(rows[0].querySelector('b')).toBeNull();
        expect(rows[1].textContent).toContain('Requested by Anonymous');
        expect(rows[2].textContent).not.toContain('Requested by');
        expect(rows[3].textContent).not.toContain('Requested by');
    } finally {
        await act(async () => root.unmount());
    }
});
