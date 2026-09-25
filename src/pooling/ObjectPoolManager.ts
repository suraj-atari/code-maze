import type { PoolStats } from './ObjectPool';

/** Registry of all pools so the debug overlay can report pooled/active counts. */
export class ObjectPoolManager {
  private readonly pools: PoolStats[] = [];

  register<T extends PoolStats>(pool: T): T {
    this.pools.push(pool);
    return pool;
  }

  get all(): readonly PoolStats[] {
    return this.pools;
  }

  totals(): { active: number; free: number } {
    let active = 0;
    let free = 0;
    for (const p of this.pools) {
      active += p.active;
      free += p.free;
    }
    return { active, free };
  }
}
