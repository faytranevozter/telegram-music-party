import YTMusic from 'ytmusic-api';
import type { IncomingMessage, ServerResponse } from 'node:http';

type SearchResult = {
    videoId: string;
    title: string;
    artistName: string | null;
    channelName: string | null;
    durationSeconds: number | null;
    thumbnailUrl: string | null;
};

type SearchType = 'song' | 'video';
type RequestBody = { query?: unknown; type?: unknown };
type ApiRequest = IncomingMessage & { body?: unknown };
type ApiResponse = ServerResponse & {
    status(code: number): ApiResponse;
    json(value: unknown): void;
};

const MAX_BODY_BYTES = 4_096;
const MAX_RESULTS = 20;
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 500;
const RATE_MAX_KEYS = 2_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;

const cache = new Map<string, { expiresAt: number; results: SearchResult[] }>();
const rateWindows = new Map<string, { start: number; count: number }>();
let clientPromise: Promise<InstanceType<typeof YTMusic>> | undefined;

function respond(res: ApiResponse, status: number, body: unknown): void {
    res.status(status).json(body);
}

function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return mismatch === 0;
}

async function readBody(req: ApiRequest): Promise<unknown> {
    if (req.body !== undefined) return req.body;
    return await new Promise((resolve, reject) => {
        let size = 0;
        const chunks: Buffer[] = [];
        let settled = false;
        req.on('data', (chunk: Buffer | string) => {
            if (settled) return;
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += data.length;
            if (size > MAX_BODY_BYTES) {
                settled = true;
                reject(Object.assign(new Error('body-too-large'), { statusCode: 413 }));
                return;
            }
            chunks.push(data);
        });
        req.on('end', () => {
            if (settled) return;
            settled = true;
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(Object.assign(new Error('invalid-json'), { statusCode: 400 }));
            }
        });
        req.on('error', () => {
            if (settled) return;
            settled = true;
            reject(Object.assign(new Error('invalid-json'), { statusCode: 400 }));
        });
    });
}

function allowedByRateLimit(key: string, now: number): boolean {
    for (const [storedKey, value] of rateWindows) {
        if (now - value.start >= RATE_WINDOW_MS) rateWindows.delete(storedKey);
    }
    const current = rateWindows.get(key);
    if (!current || now - current.start >= RATE_WINDOW_MS) {
        if (rateWindows.size >= RATE_MAX_KEYS) {
            rateWindows.delete(rateWindows.keys().next().value as string);
        }
        rateWindows.set(key, { start: now, count: 1 });
        return true;
    }
    if (current.count >= RATE_LIMIT) return false;
    current.count++;
    return true;
}

function normalizeSongs(value: unknown): SearchResult[] {
    if (!Array.isArray(value)) throw new Error('malformed-provider-response');
    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        if (typeof row.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(row.videoId)) continue;
        if (typeof row.name !== 'string' || !row.name.trim() || seen.has(row.videoId)) continue;
        const artist = row.artist && typeof row.artist === 'object'
            ? (row.artist as Record<string, unknown>).name
            : null;
        const thumbnail = row.thumbnails && Array.isArray(row.thumbnails)
            ? row.thumbnails.map((entry) => (entry as Record<string, unknown>)?.url)
                .filter((url): url is string => typeof url === 'string' && url.startsWith('https://')).at(-1) ?? null
            : null;
        const duration = typeof row.duration === 'number' && Number.isFinite(row.duration) && row.duration > 0
            ? row.duration
            : null;
        seen.add(row.videoId);
        results.push({
            videoId: row.videoId,
            title: row.name.trim().slice(0, 300),
            artistName: typeof artist === 'string' && artist.trim() ? artist.trim().slice(0, 300) : null,
            channelName: null,
            durationSeconds: duration,
            thumbnailUrl: thumbnail,
        });
        if (results.length === MAX_RESULTS) break;
    }
    return results;
}

function text(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
        const candidate = (value as Record<string, unknown>).text;
        if (typeof candidate === 'string') return candidate.trim();
    }
    return '';
}

function durationSeconds(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    const label = text(value);
    if (!/^\d+(?::[0-5]\d){1,2}$/.test(label)) return null;
    return label.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

function thumbnailUrl(value: unknown): string | null {
    if (!Array.isArray(value)) return null;
    const urls = value
        .map((entry) => entry && typeof entry === 'object' ? (entry as Record<string, unknown>).url : null)
        .filter((url): url is string => typeof url === 'string' && url.startsWith('https://'));
    return urls.at(-1) ?? null;
}

function normalizeVideos(value: unknown): SearchResult[] {
    if (!Array.isArray(value)) throw new Error('malformed-provider-response');
    const results: SearchResult[] = [];
    const seen = new Set<string>();
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const id = text(row.videoId ?? row.video_id);
        const title = text(row.name ?? row.title);
        if (!/^[A-Za-z0-9_-]{11}$/.test(id) || !title || seen.has(id)) continue;
        const author = text(row.author);
        seen.add(id);
        results.push({
            videoId: id,
            title: title.slice(0, 300),
            artistName: null,
            channelName: (author || text(row.artist)).slice(0, 300) || null,
            durationSeconds: durationSeconds(row.durationSeconds ?? row.duration),
            thumbnailUrl: thumbnailUrl(row.thumbnails),
        });
        if (results.length === MAX_RESULTS) break;
    }
    return results;
}

async function getClient(): Promise<InstanceType<typeof YTMusic>> {
    if (!clientPromise) {
        const client = new YTMusic();
        clientPromise = client.initialize({ HL: 'en', GL: 'ID' }).then(() => client).catch((error) => {
            clientPromise = undefined;
            throw error;
        });
    }
    return clientPromise;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        respond(res, 405, { error: 'method_not_allowed' });
        return;
    }
    const expected = process.env.SEARCH_API_TOKEN;
    const authorization = req.headers.authorization;
    const supplied = typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : '';
    if (!expected || !supplied || !safeEqual(supplied, expected)) {
        respond(res, 401, { error: 'unauthorized' });
        return;
    }
    const started = Date.now();
    const requestId = typeof req.headers['x-request-id'] === 'string'
        ? req.headers['x-request-id'].slice(0, 80)
        : 'generated';
    const respondError = (status: number, code: string) => {
        console.warn(JSON.stringify({ event: 'song_search', requestId, outcome: code, elapsedMs: Date.now() - started }));
        respond(res, status, { error: code, requestId });
    };
    const contentType = req.headers['content-type'] ?? '';
    if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('application/json')) {
        respondError(415, 'unsupported_media_type');
        return;
    }
    // Vercel instances do not share memory. Let the platform's request
    // controls enforce global quotas; this in-memory guard is best-effort only.
    const rateKey = `${req.headers['x-forwarded-for'] ?? 'unknown'}:${expected.slice(0, 12)}`;
    if (!allowedByRateLimit(rateKey, Date.now())) {
        respondError(429, 'rate_limited');
        return;
    }

    let body: unknown;
    try {
        body = await readBody(req);
    } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? 400;
        respondError(status, status === 413 ? 'body_too_large' : 'invalid_json');
        return;
    }
    const requestBody = body && typeof body === 'object' ? body as RequestBody : {};
    const queryValue = requestBody.query;
    const type: SearchType = requestBody.type === undefined ? 'song' : requestBody.type as SearchType;
    if (type !== 'song' && type !== 'video') {
        respondError(400, 'invalid_type');
        return;
    }
    if (typeof queryValue !== 'string') {
        respondError(400, 'invalid_query');
        return;
    }
    const query = queryValue.trim().replace(/\s+/g, ' ');
    if (query.length < 3 || query.length > 200) {
        respondError(400, 'invalid_query');
        return;
    }

    const now = Date.now();
    const cacheKey = `${type}:${query.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
        respond(res, 200, { results: cached.results, requestId, cached: true });
        return;
    }
    cache.delete(cacheKey);
    try {
        const client = await Promise.race([
            getClient(),
            new Promise<never>((_, reject) => {
                const timer = setTimeout(() => reject(new Error('search-timeout')), REQUEST_TIMEOUT_MS);
                timer.unref?.();
            }),
        ]);
        const raw = await Promise.race([
            type === 'song'
                ? client.searchSongs(query)
                : client.searchVideos(query),
            new Promise<never>((_, reject) => {
                const timer = setTimeout(() => reject(new Error('search-timeout')), REQUEST_TIMEOUT_MS);
                timer.unref?.();
            }),
        ]);
        const results = type === 'song' ? normalizeSongs(raw) : normalizeVideos(raw);
        if (results.length) {
            if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
            cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, results });
        }
        console.info(JSON.stringify({ event: 'media_search', type, requestId, outcome: results.length ? 'ok' : 'empty', count: results.length, elapsedMs: Date.now() - started }));
        respond(res, 200, { results, requestId, cached: false });
    } catch (error) {
        const name = error instanceof Error ? error.name : '';
        const message = error instanceof Error ? error.message : '';
        // Never emit provider exception text or request details; classify only.
        const timeout = message === 'search-timeout' || name === 'TimeoutError' || name === 'AbortError';
        const rateLimited = (error as { response?: { status?: number }; status?: number } | null)?.response?.status === 429 ||
            (error as { status?: number } | null)?.status === 429;
        respondError(timeout ? 504 : rateLimited ? 503 : 502, timeout ? 'provider_timeout' : rateLimited ? 'provider_rate_limited' : 'provider_unavailable');
    }
}
