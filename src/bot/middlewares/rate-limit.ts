import { ExpiringStore } from '../../utils/expiring.store.ts';

export function rateLimiter(
  capacity: number,
  windowMs: number,
  limit: number,
  clock = () => performance.now(),
) {
  const users = new ExpiringStore<number, { count: number }>(
    capacity,
    windowMs,
    clock,
  );
  return {
    allow(userId: number): boolean {
      const slot = users.get(userId);
      if (!slot) return users.set(userId, { count: 1 });
      if (slot.count >= limit) return false;
      slot.count++;
      return true;
    },
    sweep: () => {
      users.sweep();
    },
  };
}
