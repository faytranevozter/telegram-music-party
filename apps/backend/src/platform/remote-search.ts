import type { RemoteSearchConfig } from '../config/remote-search';
import {
    SearchProviderError,
    VideoSearchResult,
    VideoSearchType,
} from './video-search';

const MAX_BYTES = 128 * 1024;

export function parseRemoteResults(payload: unknown): VideoSearchResult[] {
    const rows = (payload as { results?: unknown } | null)?.results;
    if (!Array.isArray(rows) || rows.length > 20)
        throw new SearchProviderError('malformed');
    const seen = new Set<string>();
    return rows.map((row: unknown) => {
        if (!row || typeof row !== 'object')
            throw new SearchProviderError('malformed');
        const r = row as Record<string, unknown>;
        const optionalText = (value: unknown): value is string | null =>
            value === null ||
            (typeof value === 'string' && value.length <= 300);
        if (
            typeof r.videoId !== 'string' ||
            !/^[A-Za-z0-9_-]{11}$/.test(r.videoId) ||
            seen.has(r.videoId) ||
            typeof r.title !== 'string' ||
            !r.title.trim() ||
            r.title.length > 300 ||
            !optionalText(r.artistName) ||
            !optionalText(r.channelName) ||
            !(
                r.durationSeconds === null ||
                (typeof r.durationSeconds === 'number' &&
                    Number.isFinite(r.durationSeconds) &&
                    r.durationSeconds > 0)
            ) ||
            !(
                r.thumbnailUrl === null ||
                (typeof r.thumbnailUrl === 'string' &&
                    r.thumbnailUrl.length <= 4096 &&
                    /^https:\/\//.test(r.thumbnailUrl))
            )
        )
            throw new SearchProviderError('malformed');
        seen.add(r.videoId);
        return {
            videoId: r.videoId,
            title: r.title.trim(),
            artistName: r.artistName,
            channelName: r.channelName,
            durationSeconds: r.durationSeconds,
            thumbnailUrl: r.thumbnailUrl,
        };
    });
}

/** One deadline includes headers and body; never follow secret-bearing redirects. */
export async function searchRemote(
    config: RemoteSearchConfig,
    query: string,
    type: VideoSearchType,
): Promise<VideoSearchResult[]> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const operation = async () => {
        const response = await fetch(config.url, {
            method: 'POST',
            redirect: 'error',
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.token}`,
                ...(config.bypass
                    ? { 'x-vercel-protection-bypass': config.bypass }
                    : {}),
            },
            body: JSON.stringify({ query, type }),
        });
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.toLowerCase().includes('application/json'))
            throw new SearchProviderError('protection');
        if (response.status === 401 || response.status === 403)
            throw new SearchProviderError('authentication');
        if (response.status === 429 || response.status === 503)
            throw new SearchProviderError('rate-limit');
        if (response.status === 504) throw new SearchProviderError('timeout');
        if (response.status === 400)
            throw new SearchProviderError('invalid-request');
        if (!response.ok) throw new SearchProviderError('network');
        if (!response.body) throw new SearchProviderError('malformed');
        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > MAX_BYTES) throw new SearchProviderError('malformed');
            chunks.push(chunk.value);
        }
        let payload: unknown;
        try {
            payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
            throw new SearchProviderError('malformed');
        }
        return parseRemoteResults(payload);
    };
    try {
        return await Promise.race([
            operation(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    controller.abort();
                    reject(new SearchProviderError('timeout'));
                }, config.timeoutMs);
            }),
        ]);
    } catch (error) {
        if (error instanceof SearchProviderError) throw error;
        throw new SearchProviderError(
            controller.signal.aborted ? 'timeout' : 'network',
        );
    } finally {
        clearTimeout(timer);
        controller.abort();
        if (reader) void reader.cancel().catch(() => undefined);
    }
}
