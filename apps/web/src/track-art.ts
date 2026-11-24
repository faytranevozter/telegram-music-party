export function coverSources(videoId?: string, thumbnailUrl?: string | null): string[] {
    const sources: string[] = [];
    if (thumbnailUrl) {
        try {
            const url = new URL(thumbnailUrl);
            if (url.protocol === 'https:' && !url.username && !url.password) sources.push(thumbnailUrl);
        } catch { /* Unusable provider artwork. */ }
    }
    if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
        const fallback = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
        if (!sources.includes(fallback)) sources.push(fallback);
    }
    return sources;
}

export function formatTrackDuration(seconds?: number | null): string | null {
    if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    const remainder = String(whole % 60).padStart(2, '0');
    return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
}
/** Queue entries currently carry the server's display label, not separate metadata. */
export function queueTrackDisplay(label: string): { title: string; detail?: string } {
    const match = /^(.+) \[(\d+(?::\d{2}){1,2}|Duration unavailable)\]$/.exec(label);
    const separator = match?.[1].lastIndexOf(' - ') ?? -1;
    if (!match || separator <= 0 || separator + 3 === match[1].length) return { title: label };
    const artist = match[1].slice(separator + 3);
    return {
        title: match[1].slice(0, separator),
        detail: match[2] === 'Duration unavailable' ? artist : `${artist} · ${match[2]}`,
    };
}
