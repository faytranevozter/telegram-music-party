export const PLAYBACK_SOURCES = [
    'requested',
    'autoplay',
    'manual',
    'unknown',
] as const;

export type PlaybackSource = (typeof PLAYBACK_SOURCES)[number];

export const PLAYBACK_END_REASONS = [
    'completed',
    'skipped',
    'interrupted',
    'replaced',
    'unknown',
] as const;

export type PlaybackEndReason = (typeof PLAYBACK_END_REASONS)[number];

export const PLAYBACK_REPORT_EVENTS = ['start', 'progress', 'end'] as const;

export type PlaybackReportEvent = (typeof PLAYBACK_REPORT_EVENTS)[number];

export interface PlaybackReport {
    roomId: string;
    playbackId: string;
    videoId: string;
    requestId?: string | null;
    title: string;
    artist: string;
    durationMs?: number | null;
    source: PlaybackSource;
    event: PlaybackReportEvent;
    /** ISO timestamp of when the extension observed the start. */
    startedAt: string;
    /** ISO timestamp of the end observation; null while the session is open. */
    endedAt?: string | null;
    /** Observed playing time, excluding pauses and seek jumps. */
    listenedMs: number;
    endReason?: PlaybackEndReason | null;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PLAYBACK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T/;
const MAX_TEXT_LENGTH = 300;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_REPORT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const clampText = (value: unknown): string =>
    typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : '';

const asEnum = <T extends string>(
    values: readonly T[],
    value: unknown,
    fallback: T,
): T => (values.includes(value as T) ? (value as T) : fallback);

/**
 * Validates a report sent by the extension. Unknown extra fields are ignored;
 * malformed identity fields reject the whole report so analytics cannot be
 * poisoned by arbitrary payloads.
 */
export function validatePlaybackReport(value: unknown): PlaybackReport | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;

    if (typeof data.roomId !== 'string' || !ID_PATTERN.test(data.roomId)) {
        return null;
    }
    if (
        typeof data.playbackId !== 'string' ||
        !PLAYBACK_ID_PATTERN.test(data.playbackId)
    ) {
        return null;
    }
    if (typeof data.videoId !== 'string' || !ID_PATTERN.test(data.videoId)) {
        return null;
    }
    if (
        typeof data.event !== 'string' ||
        !PLAYBACK_REPORT_EVENTS.includes(data.event as PlaybackReportEvent)
    ) {
        return null;
    }
    if (
        typeof data.startedAt !== 'string' ||
        !ISO_DATE_PATTERN.test(data.startedAt)
    ) {
        return null;
    }
    const startedAt = new Date(data.startedAt);
    if (Number.isNaN(startedAt.getTime())) return null;
    const now = Date.now();
    if (
        startedAt.getTime() > now + MAX_FUTURE_SKEW_MS ||
        startedAt.getTime() < now - MAX_REPORT_AGE_MS
    ) {
        return null;
    }
    if (
        typeof data.listenedMs !== 'number' ||
        !Number.isFinite(data.listenedMs)
    ) {
        return null;
    }

    const durationMs =
        typeof data.durationMs === 'number' && Number.isFinite(data.durationMs)
            ? Math.min(
                  Math.max(Math.round(data.durationMs), 0),
                  MAX_DURATION_MS,
              )
            : null;
    const requestId =
        typeof data.requestId === 'string' && ID_PATTERN.test(data.requestId)
            ? data.requestId
            : null;
    const event = data.event as PlaybackReportEvent;
    const endedAtMs =
        event === 'end' &&
        typeof data.endedAt === 'string' &&
        ISO_DATE_PATTERN.test(data.endedAt) &&
        !Number.isNaN(new Date(data.endedAt).getTime())
            ? Math.max(new Date(data.endedAt).getTime(), startedAt.getTime())
            : event === 'end'
              ? Date.now()
              : null;
    const endedAt = endedAtMs ? new Date(endedAtMs).toISOString() : null;

    return {
        roomId: data.roomId,
        playbackId: data.playbackId,
        videoId: data.videoId,
        requestId,
        title: clampText(data.title),
        artist: clampText(data.artist),
        durationMs,
        source: asEnum(PLAYBACK_SOURCES, data.source, 'unknown'),
        event,
        startedAt: startedAt.toISOString(),
        endedAt,
        listenedMs: Math.min(
            Math.max(Math.round(data.listenedMs), 0),
            MAX_DURATION_MS,
        ),
        endReason:
            event === 'end'
                ? asEnum(PLAYBACK_END_REASONS, data.endReason, 'unknown')
                : null,
    };
}
