import type {
    PlaybackEndReason,
    PlaybackReportEvent,
} from 'src/types/analytics.type';

/** A play counts once 30 seconds were observed, or half of a short track. */
export const QUALIFIED_PLAY_MS = 30_000;
export const SHORT_TRACK_MS = 60_000;
/** Completion needs 90% of the known duration; we never infer it otherwise. */
export const COMPLETION_RATIO = 0.9;
/**
 * The extension checkpoints every 30 seconds even while paused. A session with
 * no observation for this long is treated as interrupted at query time.
 */
export const STALE_SESSION_MS = 2 * 60 * 1000;

export const STATS_PERIODS = ['today', 'week', 'month', 'all'] as const;

export type StatsPeriod = (typeof STATS_PERIODS)[number];

export function parseStatsPeriod(
    value: string | undefined,
): StatsPeriod | null {
    if (!value) return null;
    const normalized = value.toLowerCase();
    if (normalized === 'day') return 'today';
    return STATS_PERIODS.includes(normalized as StatsPeriod)
        ? (normalized as StatsPeriod)
        : null;
}

export function resolvePeriod(
    period: StatsPeriod,
    now: Date = new Date(),
): { start: Date | null; label: string } {
    switch (period) {
        case 'today': {
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);
            return { start, label: 'Today' };
        }
        case 'week': {
            // Calendar week, Monday 00:00 in the server's local timezone.
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);
            const day = (start.getDay() + 6) % 7;
            start.setDate(start.getDate() - day);
            return { start, label: 'This week' };
        }
        case 'month': {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            return { start, label: 'This month' };
        }
        case 'all':
        default:
            return { start: null, label: 'All time' };
    }
}

export function isQualifiedPlay(
    listenedMs: number,
    durationMs?: number | null,
): boolean {
    if (listenedMs >= QUALIFIED_PLAY_MS) return true;
    return (
        typeof durationMs === 'number' &&
        durationMs > 0 &&
        durationMs < SHORT_TRACK_MS &&
        listenedMs >= durationMs * 0.5
    );
}

/**
 * Completion is only established from observed duration; a missing duration
 * never counts as completed, even when the player reports an end.
 */
export function isCompletedPlay(
    listenedMs: number,
    durationMs?: number | null,
): boolean {
    return (
        typeof durationMs === 'number' &&
        durationMs > 0 &&
        listenedMs >= durationMs * COMPLETION_RATIO
    );
}

export function sessionStatusForEnd(
    reason: PlaybackEndReason,
): 'closed' | 'incomplete' {
    return reason === 'interrupted' || reason === 'unknown'
        ? 'incomplete'
        : 'closed';
}

/**
 * Request outcomes only move forward: a queued request starts, a completed
 * playback marks it played, and a skip never downgrades a played request.
 */
export function nextRequestOutcome(
    current: string,
    event: PlaybackReportEvent,
    endReason?: PlaybackEndReason | null,
): string {
    if (current === 'failed') return current;
    if (event !== 'end') {
        return current === 'queued' ? 'started' : current;
    }
    if (endReason === 'completed') return 'played';
    if (endReason === 'skipped') {
        return current === 'played' ? 'played' : 'skipped';
    }
    return current === 'queued' ? 'started' : current;
}
