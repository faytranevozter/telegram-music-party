// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { artworkGradient, sampleArtworkGradient } from './artwork-gradient';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('favors the artwork hue over white pixels and keeps both stops dark', () => {
    const gradient = artworkGradient(new Uint8ClampedArray([255, 40, 20, 255, 255, 255, 255, 255]));
    const stops = [...(gradient ?? '').matchAll(/rgb\((\d+), (\d+), (\d+)\)/g)].map((match) => match.slice(1).map(Number));
    expect(stops).toHaveLength(2);
    expect(stops[0][0]).toBeGreaterThan(stops[0][1]);
    expect(stops[0][1]).toBeGreaterThan(stops[0][2]);
    expect(Math.max(...stops.flat())).toBeLessThanOrEqual(80);
    expect(stops[1][0]).toBeLessThan(stops[0][0]);
    expect(artworkGradient(new Uint8ClampedArray([255, 255, 255, 255]))).toMatch(/rgb\(80, 80, 80\)/);
    expect(artworkGradient(new Uint8ClampedArray([255, 0, 0, 0]))).toBeUndefined();
});

it.each(['blocked pixels', 'broken image', 'loaded image'])('handles %s', async (scenario) => {
    class SampleImage {
        crossOrigin = '';
        onload?: () => void;
        onerror?: () => void;
        set src(_source: string) {
            expect(this.crossOrigin).toBe('anonymous');
            if (scenario === 'broken image') this.onerror?.();
            else this.onload?.();
        }
    }
    vi.stubGlobal('Image', SampleImage);
    const getImageData = vi.fn(() => {
        if (scenario === 'blocked pixels') throw new DOMException('Unreadable pixels', 'SecurityError');
        return { data: new Uint8ClampedArray([255, 40, 20, 255]) };
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), getImageData } as unknown as CanvasRenderingContext2D);
    const gradient = await sampleArtworkGradient('https://example.test/cover.jpg');
    if (scenario === 'loaded image') expect(gradient).toContain('gradient(');
    else expect(gradient).toBeUndefined();
});
