/** Channel names are display metadata, not verified artist identities. */
export interface VideoSearchResult {
    videoId: string;
    title: string;
    channelName: string;
    durationSeconds: number | null;
    thumbnailUrl: string | null;
}

type Row = Record<string, unknown>;
const record = (value: unknown): Row =>
    value && typeof value === 'object' ? (value as Row) : {};
const text = (value: unknown): string => {
    if (typeof value === 'string') return value.trim();
    const raw = record(value).text;
    return typeof raw === 'string' ? raw.trim() : '';
};

function duration(value: unknown): number | null {
    const row = record(value);
    const label = text(row.text);
    if (/^\d+(?::[0-5]\d){1,2}$/.test(label)) {
        return label
            .split(':')
            .reduce((total, part) => total * 60 + Number(part), 0);
    }
    return typeof row.seconds === 'number' &&
        Number.isFinite(row.seconds) &&
        row.seconds > 0
        ? row.seconds
        : null;
}

function lockupChannel(metadata: Row): string {
    const rows = record(metadata.metadata).metadata_rows;
    if (!Array.isArray(rows)) return '';
    for (const row of rows) {
        const parts = record(row).metadata_parts;
        if (!Array.isArray(parts)) continue;
        for (const part of parts) {
            const label = record(record(part).text);
            const browseId = record(record(label.endpoint).payload).browseId;
            // Only a channel-linked label is a channel, not views/upload time.
            if (typeof browseId === 'string' && browseId.startsWith('UC'))
                return text(label);
        }
    }
    return '';
}

export function normalizeVideos(response: unknown): VideoSearchResult[] {
    const entries = record(response).videos;
    if (!Array.isArray(entries)) throw new SearchProviderError('malformed');
    const results: VideoSearchResult[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
        const row = record(entry);
        const lockup = row.type === 'LockupView';
        if (lockup && row.content_type !== 'VIDEO') continue;
        const metadata = record(row.metadata);
        const videoId = text(lockup ? row.content_id : row.video_id);
        const title = text(lockup ? metadata.title : row.title);
        if (!/^[\w-]{11}$/.test(videoId) || !title || seen.has(videoId))
            continue;
        seen.add(videoId);
        const images = lockup
            ? record(row.content_image).image
            : row.thumbnails;
        const thumbnails = Array.isArray(images) ? images : [];
        const thumbnail = thumbnails
            .map((item: unknown) => record(item))
            .filter(
                (item: Row) =>
                    typeof item.url === 'string' &&
                    /^https:\/\//.test(item.url),
            )
            .sort(
                (a: Row, b: Row) =>
                    (typeof b.width === 'number' ? b.width : 0) -
                    (typeof a.width === 'number' ? a.width : 0),
            )[0];
        results.push({
            videoId,
            title,
            channelName:
                (lockup
                    ? lockupChannel(metadata)
                    : text(record(row.author).name)) || 'Unknown channel',
            durationSeconds: duration(row.duration),
            thumbnailUrl:
                typeof thumbnail?.url === 'string' ? thumbnail.url : null,
        });
        if (results.length === 20) break;
    }
    return results;
}

export type SearchFailure =
    | 'initialization'
    | 'timeout'
    | 'rate-limit'
    | 'network'
    | 'malformed';
export class SearchProviderError extends Error {
    constructor(readonly kind: SearchFailure) {
        super(`Video search unavailable (${kind})`);
    }
}
