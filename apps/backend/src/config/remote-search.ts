export interface RemoteSearchConfig {
    enabled: boolean;
    url: string;
    token: string;
    bypass: string;
    timeoutMs: number;
}

/** Errors intentionally contain no configuration values. */
export function remoteSearchConfig(
    env: NodeJS.ProcessEnv = process.env,
): RemoteSearchConfig {
    const enabled = env.YTMUSIC_SEARCH_ENABLED === 'true';
    const result = {
        enabled,
        url: env.YTMUSIC_SEARCH_URL ?? '',
        token: env.YTMUSIC_SEARCH_TOKEN ?? '',
        bypass: env.YTMUSIC_SEARCH_BYPASS_SECRET ?? '',
        timeoutMs: Number(env.YTMUSIC_SEARCH_TIMEOUT_MS ?? '8000'),
    };
    if (!enabled) return result;
    let url: URL;
    try {
        url = new URL(result.url);
    } catch {
        throw new Error('Invalid remote search configuration');
    }
    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.hash ||
        url.search ||
        !result.token.trim() ||
        /[\r\n]/.test(result.token + result.bypass) ||
        !Number.isInteger(result.timeoutMs) ||
        result.timeoutMs < 100 ||
        result.timeoutMs > 15_000
    )
        throw new Error('Invalid remote search configuration');
    return result;
}
