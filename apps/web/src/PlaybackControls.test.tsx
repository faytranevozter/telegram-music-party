import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { PlayerBar } from './PlaybackControls';

const action = vi.fn();

it('leaves restricted actions visible but disables them', () => {
    const html = renderToStaticMarkup(<PlayerBar paused disabledControls={['previous', 'next', 'mute', 'unmute', 'radio', 'volume-up']} onControl={action} />);
    expect(html).toMatch(/<button[^>]*aria-label="Previous"[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*aria-label="Next"[^>]*disabled=""/);
    expect(html).not.toMatch(/<button[^>]*aria-label="Play"[^>]*disabled=""/);
    expect(html.match(/disabled=""/g)).toHaveLength(5);
    expect(html).toContain('disabled:cursor-not-allowed');
    expect(html).toMatch(/<button[^>]*disabled:text-neutral-content\/70[^>]*disabled=""[^>]*>.*?Start radio<\/button>/);
});

it('disables all player commands offline without disabling More', () => {
    const html = renderToStaticMarkup(<PlayerBar paused={false} muted disabled onControl={action} />);
    expect(html.match(/disabled=""/g)).toHaveLength(8);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>More<\/button>/);
    expect(html).toContain('Unmute');
});

it.each([true, false])('keeps the disabled play/pause control visible on the player panel (paused=%s)', (paused) => {
    const html = renderToStaticMarkup(<PlayerBar paused={paused} disabled onControl={action} />);
    const label = paused ? 'Play' : 'Pause';
    const button = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0];
    expect(button).toContain('disabled=""');
    expect(button).toContain('disabled:bg-neutral-content/20');
    expect(button).toContain('disabled:text-neutral-content');
});
