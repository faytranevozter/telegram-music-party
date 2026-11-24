import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SongSearchForm } from './RoomPanels';

it('joins the search-type selector between the input and search button', () => {
    const html = renderToStaticMarkup(<SongSearchForm query="music" onChange={vi.fn()} onSearch={vi.fn()}><select aria-label="Search type"><option>Songs</option><option>Videos</option></select></SongSearchForm>);
    expect(html).toMatch(/class="join flex w-full"[^>]*>.*?<input.*?<select.*?<button/);
    expect(html).toContain('aria-label="Search type"');
});
