import { Inject, Injectable, Logger } from '@nestjs/common';
import Keyv from 'keyv';
import { SONG_SEARCH_INSTANCES } from 'src/config/search';
import {
    normalizePipedSongs,
    normalizeVideos,
    SearchProviderError,
    VideoSearchResult,
    VideoSearchType,
} from './video-search';

export interface VideoSearchClient {
    search(query: string, filters: { type: 'video' }): Promise<unknown>;
}

// CommonJS tsc rewrites import() to require(). Preserve the native ESM loader
// for youtubei.js 18.3.0, including in the Node 24 Docker runtime.
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- fixed module string, never user input
const importYoutube = new Function(
    'return import("youtubei.js")',
) as () => Promise<{
    Innertube: {
        create(options: Record<string, unknown>): Promise<VideoSearchClient>;
    };
}>;

@Injectable()
export class YTMusicService {
    private readonly logger = new Logger(YTMusicService.name);
    private client: Promise<VideoSearchClient> | null = null;
    private readonly pending = new Map<string, Promise<VideoSearchResult[]>>();
    private readonly retryAfter = new Map<VideoSearchType, number>();
    private readonly timeoutMs = 8_000;

    constructor(@Inject('KEYV_CACHE') private readonly cache: Keyv) {}

    protected async createClient(): Promise<VideoSearchClient> {
        const { Innertube } = await importYoutube();
        return Innertube.create({
            generate_session_locally: true,
            retrieve_player: false,
            lang: 'en',
            location: 'ID',
            fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
                const response = await fetch(input, {
                    ...init,
                    signal: init?.signal
                        ? AbortSignal.any([
                              init.signal,
                              AbortSignal.timeout(this.timeoutMs),
                          ])
                        : AbortSignal.timeout(this.timeoutMs),
                });
                // 18.3.0 stores only response text in InnertubeError.info; retain
                // HTTP 429 explicitly without logging the response or query.
                if (response.status === 429) {
                    await response.body?.cancel();
                    throw new SearchProviderError('rate-limit');
                }
                return response;
            },
        });
    }

    private async bounded<T>(operation: Promise<T>): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                operation,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () => reject(new SearchProviderError('timeout')),
                        this.timeoutMs,
                    );
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    async searchSongs(
        keyword: string,
        type: VideoSearchType = 'song',
    ): Promise<VideoSearchResult[]> {
        const query = keyword.trim().replace(/\s+/g, ' ').slice(0, 200);
        if (query.length < 3) return [];
        const key = `video-search:v2:${type}:${query.toLowerCase()}`;
        const cached = await this.cache.get<VideoSearchResult[]>(key);
        if (cached) return cached;
        const pending = this.pending.get(key);
        if (pending) return pending;
        if (
            Date.now() < (this.retryAfter.get(type) ?? 0) ||
            this.pending.size >= 4
        )
            return [];
        const operation = this.searchProvider(query, type).then(
            async (results) => {
                if (results.length) await this.cache.set(key, results, 30_000);
                return results;
            },
        );
        this.pending.set(key, operation);
        try {
            return await operation;
        } finally {
            this.pending.delete(key);
        }
    }

    private async searchProvider(
        query: string,
        type: VideoSearchType,
    ): Promise<VideoSearchResult[]> {
        try {
            return type === 'song'
                ? await this.searchPiped(query)
                : await this.searchYoutubeVideos(query);
        } catch (error) {
            if (!(error instanceof SearchProviderError)) throw error;
            this.retryAfter.set(
                type,
                Date.now() + (error.kind === 'rate-limit' ? 30_000 : 5_000),
            );
            this.logger.warn(`Search failed (${type}): ${error.kind}`);
            return [];
        }
    }

    /**
     * YouTube Music blocks some cloud regions (the current Tencent host answers
     * "not available in your area"), so songs come from a keyless Piped API.
     * Each configured instance is tried in order; positive results are cached.
     */
    private async searchPiped(query: string): Promise<VideoSearchResult[]> {
        let last: SearchProviderError | null = null;
        for (const instance of SONG_SEARCH_INSTANCES) {
            const base = instance.replace(/\/+$/, '');
            try {
                const response = await this.bounded(
                    fetch(
                        `${base}/search?q=${encodeURIComponent(query)}&filter=music_songs`,
                        {
                            headers: { Accept: 'application/json' },
                            signal: AbortSignal.timeout(this.timeoutMs),
                        },
                    ),
                );
                if (response.status === 429) {
                    throw new SearchProviderError('rate-limit');
                }
                if (!response.ok) {
                    throw new SearchProviderError('network');
                }
                return normalizePipedSongs(await response.json());
            } catch (error) {
                last = this.toSearchError(error);
            }
        }
        throw last ?? new SearchProviderError('network');
    }

    private async searchYoutubeVideos(
        query: string,
    ): Promise<VideoSearchResult[]> {
        if (!this.client) {
            this.client = this.bounded(this.createClient()).catch(
                (error: unknown) => {
                    this.client = null;
                    throw this.toSearchError(error, 'initialization');
                },
            );
        }
        const client = await this.client;
        let response: unknown;
        try {
            response = await this.bounded(
                client.search(query, { type: 'video' }),
            );
        } catch (error) {
            throw this.toSearchError(error);
        }
        return normalizeVideos(response);
    }

    private toSearchError(
        error: unknown,
        fallback: 'network' | 'initialization' = 'network',
    ): SearchProviderError {
        if (error instanceof SearchProviderError) return error;
        const detail = error as {
            info?: { status_code?: number };
            status?: number;
            name?: string;
        } | null;
        const status = detail?.info?.status_code ?? detail?.status;
        const timeout =
            detail?.name === 'TimeoutError' || detail?.name === 'AbortError';
        return new SearchProviderError(
            status === 429 ? 'rate-limit' : timeout ? 'timeout' : fallback,
        );
    }
}
