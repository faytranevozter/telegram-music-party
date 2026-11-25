import { Inject, Injectable } from '@nestjs/common';
import KeyvRedis from '@keyv/redis';
import Keyv from 'keyv';
import { createHash, randomUUID } from 'node:crypto';

const reserve = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local period = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 86400000)
local lower = '(' .. string.format('%.0f', now - period)
local count = redis.call('ZCOUNT', KEYS[1], lower, '+inf')
if count >= limit then
    local entry = redis.call('ZRANGEBYSCORE', KEYS[1], lower, '+inf', 'WITHSCORES', 'LIMIT', count - limit, 1)
    return tonumber(entry[2]) + period
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], 86400000)
return 0
`;

export type GuestQuotaReservation =
    | { allowed: true; reservationId: string }
    | { allowed: false; retryAt: number };

@Injectable()
export class GuestRequestQuotaService {
    constructor(@Inject('KEYV_CACHE') private readonly cache: Keyv) {}

    private client() {
        const store: unknown = this.cache.store;
        if (!(store instanceof KeyvRedis)) throw new Error('Guest request quota requires Redis');
        return store.client;
    }

    private key(roomId: string, userRef: string) {
        const digest = createHash('sha256').update(JSON.stringify([roomId, userRef])).digest('hex');
        return `ytparty:guest-request-quota:${digest}`;
    }

    async reserve(roomId: string, userRef: string, limit: number, periodMinutes: number): Promise<GuestQuotaReservation> {
        const reservationId = randomUUID();
        const retryAt = await this.client().eval(reserve, {
            keys: [this.key(roomId, userRef)],
            arguments: [String(periodMinutes * 60_000), String(limit), reservationId],
        });
        if (typeof retryAt !== 'number' || !Number.isSafeInteger(retryAt) || retryAt < 0) throw new Error('Invalid guest quota response');
        return retryAt ? { allowed: false, retryAt } : { allowed: true, reservationId };
    }

    async release(roomId: string, userRef: string, reservationId: string): Promise<void> {
        await this.client().zRem(this.key(roomId, userRef), reservationId);
    }
}
