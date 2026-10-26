import {
    isCompletedPlay,
    isQualifiedPlay,
    nextRequestOutcome,
    parseStatsPeriod,
    resolvePeriod,
    sessionStatusForEnd,
} from './analytics.util';

describe('playback thresholds', () => {
    it('qualifies a play after 30 observed seconds', () => {
        expect(isQualifiedPlay(29_999)).toBe(false);
        expect(isQualifiedPlay(30_000)).toBe(true);
    });

    it('qualifies half of a short track with a known duration', () => {
        expect(isQualifiedPlay(15_000, 30_000)).toBe(true);
        expect(isQualifiedPlay(14_999, 30_000)).toBe(false);
        // The short-track rule only applies below 60 seconds.
        expect(isQualifiedPlay(25_000, 70_000)).toBe(false);
    });

    it('never counts a play without a known duration as completed', () => {
        expect(isCompletedPlay(200_000, null)).toBe(false);
        expect(isCompletedPlay(179_999, 200_000)).toBe(false);
        expect(isCompletedPlay(180_000, 200_000)).toBe(true);
    });

    it('marks interrupted ends as incomplete sessions', () => {
        expect(sessionStatusForEnd('interrupted')).toBe('incomplete');
        expect(sessionStatusForEnd('unknown')).toBe('incomplete');
        expect(sessionStatusForEnd('completed')).toBe('closed');
        expect(sessionStatusForEnd('skipped')).toBe('closed');
    });
});

describe('request outcomes', () => {
    it('moves queued requests to started without downgrading played', () => {
        expect(nextRequestOutcome('queued', 'start')).toBe('started');
        expect(nextRequestOutcome('started', 'progress')).toBe('started');
        expect(nextRequestOutcome('played', 'start')).toBe('played');
    });

    it('records completion and skips monotonically', () => {
        expect(nextRequestOutcome('started', 'end', 'completed')).toBe(
            'played',
        );
        expect(nextRequestOutcome('started', 'end', 'skipped')).toBe('skipped');
        expect(nextRequestOutcome('played', 'end', 'skipped')).toBe('played');
        expect(nextRequestOutcome('skipped', 'end', 'completed')).toBe(
            'played',
        );
    });

    it('does not treat an interrupted end as a skip', () => {
        expect(nextRequestOutcome('started', 'end', 'interrupted')).toBe(
            'started',
        );
    });

    it('never revives a failed request', () => {
        expect(nextRequestOutcome('failed', 'start')).toBe('failed');
        expect(nextRequestOutcome('failed', 'end', 'completed')).toBe('failed');
    });
});

describe('stats periods', () => {
    it('parses supported periods case-insensitively', () => {
        expect(parseStatsPeriod('today')).toBe('today');
        expect(parseStatsPeriod('DAY')).toBe('today');
        expect(parseStatsPeriod('Week')).toBe('week');
        expect(parseStatsPeriod('month')).toBe('month');
        expect(parseStatsPeriod('all')).toBe('all');
        expect(parseStatsPeriod('year')).toBeNull();
        expect(parseStatsPeriod(undefined)).toBeNull();
    });

    it('uses local calendar boundaries', () => {
        const now = new Date(2026, 9, 26, 15, 30, 0); // Monday 26 Oct 2026
        expect(resolvePeriod('today', now).start).toEqual(
            new Date(2026, 9, 26, 0, 0, 0),
        );
        expect(resolvePeriod('week', now).start).toEqual(
            new Date(2026, 9, 26, 0, 0, 0),
        );
        expect(resolvePeriod('month', now).start).toEqual(
            new Date(2026, 9, 1, 0, 0, 0),
        );
        expect(resolvePeriod('all', now).start).toBeNull();
    });

    it('starts the week on Monday', () => {
        const sunday = new Date(2026, 9, 25, 12, 0, 0);
        expect(resolvePeriod('week', sunday).start).toEqual(
            new Date(2026, 9, 19, 0, 0, 0),
        );
    });
});
