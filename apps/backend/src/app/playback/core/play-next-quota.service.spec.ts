/* Room fixtures are partial by design. */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import Keyv from 'keyv';
import { PlayNextQuotaService } from './play-next-quota.service';

function localDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function build() {
    const cache = new Keyv();
    return { cache, service: new PlayNextQuotaService(cache) };
}

describe('PlayNextQuotaService', () => {
    it('has no remaining count when the room limit is unlimited', async () => {
        const { service } = build();
        const room = { id: 'room', Feature: { dailyPlayNextLimit: 0 } };
        expect(await service.remaining(room as any, '7')).toBeNull();
    });

    it('has no remaining count without a Feature row', async () => {
        const { service } = build();
        const room = { id: 'room', Feature: null };
        expect(await service.remaining(room, '7')).toBeNull();
    });

    it('counts down from the limit and never below zero', async () => {
        const { service } = build();
        const room = { id: 'room', Feature: { dailyPlayNextLimit: 3 } };

        expect(await service.remaining(room as any, '7')).toBe(3);
        await service.record('room', '7');
        expect(await service.remaining(room as any, '7')).toBe(2);
        await service.record('room', '7');
        await service.record('room', '7');
        expect(await service.remaining(room as any, '7')).toBe(0);
        await service.record('room', '7');
        expect(await service.remaining(room as any, '7')).toBe(0);
    });

    it('counts each user in a room separately', async () => {
        const { service } = build();
        const room = { id: 'room', Feature: { dailyPlayNextLimit: 3 } };

        await service.record('room', '7');
        expect(await service.remaining(room as any, '7')).toBe(2);
        expect(await service.remaining(room as any, '8')).toBe(3);
    });

    it('writes the historical cache key shape', async () => {
        const { cache, service } = build();
        await service.record('room', '7');
        expect(await cache.get(`playnext-daily:room:7:${localDateKey()}`)).toBe(
            1,
        );
    });

    it('reports the used count independently of the limit', async () => {
        const { service } = build();
        expect(await service.used('room', '7')).toBe(0);
        await service.record('room', '7');
        expect(await service.used('room', '7')).toBe(1);
    });
});
