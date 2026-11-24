export function artworkGradient(pixels: Uint8ClampedArray): string | undefined {
    let red = 0, green = 0, blue = 0, total = 0;
    for (let index = 0; index + 3 < pixels.length; index += 4) {
        const [r, g, b, alpha] = pixels.subarray(index, index + 4);
        if (alpha < 128) continue;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        const weight = 1 + chroma / 12;
        red += r * weight;
        green += g * weight;
        blue += b * weight;
        total += weight;
    }
    if (!total) return;

    const color = [red / total, green / total, blue / total];
    const scale = Math.min(1, 80 / Math.max(...color));
    const tint = color.map((channel) => Math.round(channel * scale));
    const shadow = tint.map((channel) => Math.round(8 + channel * 0.18));
    return `linear-gradient(155deg, rgb(${tint.join(', ')}), rgb(${shadow.join(', ')}))`;
}

export function sampleArtworkGradient(source: string): Promise<string | undefined> {
    return new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.referrerPolicy = 'no-referrer';
        image.onerror = () => resolve(undefined);
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 24;
                canvas.height = 24;
                const context = canvas.getContext('2d');
                if (!context) return resolve(undefined);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(artworkGradient(context.getImageData(0, 0, canvas.width, canvas.height).data));
            } catch {
                resolve(undefined);
            }
        };
        image.src = source;
    });
}
