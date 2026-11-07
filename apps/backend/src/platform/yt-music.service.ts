import { Inject, Injectable, Logger } from '@nestjs/common';
import Keyv from 'keyv';
import { ENV } from '../config/env';
import { searchRemote } from './remote-search';
import {
    normalizeSongs,
    normalizeVideos,
    SearchProviderError,
    VideoSearchResult,
    VideoSearchType,
} from './video-search';

export interface VideoSearchClient {
    search(query: string, filters: { type: 'video' }): Promise<unknown>;
    music: {
        search(query: string, filters: { type: 'song' }): Promise<unknown>;
    };
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
        const provider = ENV.REMOTE_SEARCH.enabled ? 'remote-v1' : 'local-v2';
        const key = `video-search:${provider}:${type}:${query.toLowerCase()}`;
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
            if (ENV.REMOTE_SEARCH.enabled) {
                return await searchRemote(ENV.REMOTE_SEARCH, query, type);
            }
            if (!this.client) {
                this.client = this.bounded(this.createClient()).catch(
                    (error: unknown) => {
                        this.client = null;
                        if (error instanceof SearchProviderError) throw error;
                        throw new SearchProviderError('initialization');
                    },
                );
            }
            const client = await this.client;
            let response: unknown;
            try {
                response = await this.bounded(
                    type === 'song'
                        ? client.music.search(query, { type: 'song' })
                        : client.search(query, { type: 'video' }),
                );
            } catch (error: unknown) {
                if (error instanceof SearchProviderError) throw error;
                const detail = error as {
                    info?: { status_code?: number };
                    status?: number;
                    name?: string;
                } | null;
                const status = detail?.info?.status_code ?? detail?.status;
                const timeout =
                    detail?.name === 'TimeoutError' ||
                    detail?.name === 'AbortError';
                throw new SearchProviderError(
                    status === 429
                        ? 'rate-limit'
                        : timeout
                          ? 'timeout'
                          : 'network',
                );
            }
            return type === 'song'
                ? normalizeSongs(response)
                : normalizeVideos(response);
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
}
