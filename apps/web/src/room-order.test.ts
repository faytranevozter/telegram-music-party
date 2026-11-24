import { expect, it } from 'vitest';
import { readOrder } from './room-order';
import { ApiError, explain } from './api';

it('rejects a stale read after a live snapshot or a newer read', () => {
    const order = readOrder();
    const beforeLive = order.begin();
    order.invalidate();
    expect(beforeLive()).toBe(false);
    const first = order.begin();
    const second = order.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
    order.invalidate();
    expect(second()).toBe(false);
});

it('explains queue and throttle conflicts without a retry', () => {
    expect(explain(new ApiError(409, 'queue-full'))).toContain('queue is full');
    expect(explain(new ApiError(429))).toContain('Wait a minute');
});
