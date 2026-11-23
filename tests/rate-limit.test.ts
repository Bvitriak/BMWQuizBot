import { describe, expect, it } from 'vitest';
import { rateLimiter } from '../src/bot/middlewares/rate-limit.ts';
import { ExpiringStore } from '../src/utils/expiring.store.ts';

describe('bounded storage', () => {
  it('expires and refreshes keys without evicting live entries', () => {
    let now = 0;
    const store = new ExpiringStore<string, string>(2, 10, () => now);
    expect(store.set('a', 'one')).toBe(true);
    expect(store.set('b', 'two')).toBe(true);
    expect(store.set('c', 'three')).toBe(false);
    now = 5;
    expect(store.set('a', 'updated')).toBe(true);
    now = 10;
    expect(store.set('c', 'three')).toBe(true);
    expect(store.get('b')).toBeUndefined();
    expect(store.get('a')).toBe('updated');
    now = 15;
    expect(store.get('a')).toBeUndefined();
  });

  it('rejects new rate keys at capacity and resets quotas after the fixed window', () => {
    let now = 0;
    const rate = rateLimiter(1, 10, 2, () => now);
    expect([
      rate.allow(1),
      rate.allow(1),
      rate.allow(1),
      rate.allow(2),
    ]).toEqual([true, true, false, false]);
    now = 10;
    rate.sweep();
    expect([rate.allow(2), rate.allow(1)]).toEqual([true, false]);
  });
});
