import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SearchTrackRow } from './RoomPanels';

it('places actions side by side with a narrow-screen row below the track', () => {
    const html = renderToStaticMarkup(<SearchTrackRow cover={<span>Cover</span>} title="Track" detail="Artist" actions={<><button>Add to queue</button><button>Play Next</button></>} />);
    expect(html).toContain('col-span-2');
    expect(html).toContain('flex-row');
    expect(html).toContain('sm:col-span-1');
});
