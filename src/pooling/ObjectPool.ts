export interface PoolStats {
  readonly name: string;
  readonly active: number;
  readonly free: number;
}

/**
 * Generic free-list pool. Objects are created by the factory, handed out with `acquire`,
 * and returned with `release`. The optional `reset` hook runs on release.
 */
export class ObjectPool<T> implements PoolStats {
  private readonly freeList: T[] = [];
  private activeCount = 0;

  constructor(
    readonly name: string,
    private readonly factory: () => T,
    private readonly resetFn?: (item: T) => void,
    prewarm = 0,
    private readonly maxSize = Number.POSITIVE_INFINITY,
  ) {
    for (let i = 0; i < prewarm; i++) this.freeList.push(this.factory());
  }

  get active(): number {
    return this.activeCount;
  }

  get free(): number {
    return this.freeList.length;
  }

  /** Returns null when the pool is capped and exhausted. */
  acquire(): T | null {
    let item = this.freeList.pop();
    if (item === undefined) {
      if (this.activeCount >= this.maxSize) return null;
      item = this.factory();
    }
    this.activeCount++;
    return item;
  }

  release(item: T): void {
    this.resetFn?.(item);
    this.freeList.push(item);
    this.activeCount--;
  }

  /** Destroys pooled (free) items. Active items remain the caller's responsibility. */
  drain(destroy?: (item: T) => void): void {
    if (destroy) for (const item of this.freeList) destroy(item);
    this.freeList.length = 0;
  }
}
