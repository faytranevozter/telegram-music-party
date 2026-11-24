import { HttpException, Inject, Injectable } from '@nestjs/common';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { createHash } from 'node:crypto';

const increment = `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end; return n`;

@Injectable()
export class WebRateLimitService {
    constructor(@Inject('KEYV_CACHE') private readonly cache: Keyv) {}

    async require(
        kind: 'entry' | 'search' | 'mutation',
        subject: string,
        max: number,
    ) {
        const store: unknown = this.cache.store;
        if (!(store instanceof KeyvRedis))
            throw new Error('Web rate limits require Redis');
        const digest = createHash('sha256').update(subject).digest('hex');
        const result = await store.client.eval(increment, {
            keys: [`ytparty:web-limit:${kind}:${digest}`],
            arguments: [],
        });
        if (typeof result !== 'number')
            throw new Error('Invalid rate-limit counter');
        if (result > max) throw new HttpException('Rate limit exceeded', 429);
    }
}
