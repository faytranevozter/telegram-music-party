import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { QueueActions } from './QueueActions';

it('shows labeled queue actions with decorative icons', () => {
    const html = renderToStaticMarkup(<QueueActions title="Song" queued={false} busy={false} playNext remaining={2} onAdd={vi.fn()} />);
    expect(html).toContain('Add Song to queue');
    expect(html).toContain('>Queue</button>');
    expect(html).toContain('>Next</button>');
    expect(html).toContain('title="Add to queue"');
    expect(html).toContain('title="Play Next"');
    expect(html).toContain('Play Song next');
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
});

it('hides play next for queued tracks and disables it when quota is exhausted', () => {
    const queued = renderToStaticMarkup(<QueueActions title="Song" queued busy={false} playNext remaining={2} onAdd={vi.fn()} />);
    expect(queued).not.toContain('Play Song next');
    expect(queued).toContain('Song is queued');
    const limited = renderToStaticMarkup(<QueueActions title="Song" queued={false} busy={false} playNext remaining={0} onAdd={vi.fn()} />);
    expect(limited).toMatch(/aria-label="Play Song next"[^>]*disabled=""|disabled=""[^>]*aria-label="Play Song next"/);
});
