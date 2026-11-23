export class ExpiringStore<K, V> {
  readonly #entries = new Map<K, { value: V; expires: number }>();
  readonly #limit: number;
  readonly #ttl: number;
  readonly #clock: () => number;

  constructor(limit: number, ttl: number, clock = () => performance.now()) {
    this.#limit = limit;
    this.#ttl = ttl;
    this.#clock = clock;
  }

  get(key: K): V | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return;
    if (entry.expires <= this.#clock()) {
      this.#entries.delete(key);
      return;
    }
    return entry.value;
  }

  set(key: K, value: V): boolean {
    if (!this.#entries.has(key) && this.#entries.size >= this.#limit) {
      this.sweep();
      if (this.#entries.size >= this.#limit) return false;
    }
    this.#entries.delete(key);
    this.#entries.set(key, { value, expires: this.#clock() + this.#ttl });
    return true;
  }

  delete(key: K): void {
    this.#entries.delete(key);
  }

  sweep(): void {
    const now = this.#clock();
    for (const [key, { expires }] of this.#entries) {
      if (expires > now) break;
      this.#entries.delete(key);
    }
  }
}
