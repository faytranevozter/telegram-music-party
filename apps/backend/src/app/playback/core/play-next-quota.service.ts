import { Inject, Injectable } from '@nestjs/common';
import Keyv from 'keyv';
import type { Feature } from '@prisma/client';
import { telegramIdFromUserRef } from './user-ref';

type QuotaRoom = {
    id: string;
    Feature: Feature | null;
};

/**
 * Per-user daily allowance for Play Next. Keys are scoped by local date so the
 * allowance resets at local midnight, and they keep the historical
 * `playnext-daily:<room>:<user>:<date>` shape so a deploy does not reset them.
 */
@Injectable()
export class PlayNextQuotaService {
    constructor(@Inject('KEYV_CACHE') private readonly cache: Keyv) {}

    async used(roomId: string, userRef: string): Promise<number> {
        return this.readCount(roomId, userRef, this.localDateKey(new Date()));
    }

    /** Remaining uses today, or null when the room has no limit. */
    async remaining(room: QuotaRoom, userRef: string): Promise<number | null> {
        const limit = room.Feature?.dailyPlayNextLimit || 0;
        if (limit <= 0) return null;
        const used = await this.used(room.id, userRef);
        return Math.max(limit - used, 0);
    }

    async record(roomId: string, userRef: string): Promise<void> {
        const now = new Date();
        const date = this.localDateKey(now);
        const key = this.key(roomId, userRef, date);
        const count = (await this.readCount(roomId, userRef, date)) + 1;
        await this.cache.set(
            key,
            count,
            this.millisecondsUntilLocalMidnight(now) + 60_000,
        );
    }

    private async readCount(roomId: string, userRef: string, date: string) {
        const current = await this.cache.get<number>(
            this.key(roomId, userRef, date),
        );
        if (current !== undefined) return current;
        const legacyId = telegramIdFromUserRef(userRef);
        return legacyId
            ? ((await this.cache.get<number>(
                  this.key(roomId, legacyId, date),
              )) ?? 0)
            : 0;
    }

    private key(roomId: string, userRef: string, date: string) {
        return `playnext-daily:${roomId}:${userRef}:${date}`;
    }

    private localDateKey(now: Date) {
        const year = now.getFullYear();
        const month = `${now.getMonth() + 1}`.padStart(2, '0');
        const day = `${now.getDate()}`.padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private millisecondsUntilLocalMidnight(now: Date) {
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        return midnight.getTime() - now.getTime();
    }
}
