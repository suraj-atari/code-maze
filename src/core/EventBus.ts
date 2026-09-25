export type Listener<T> = (payload: T) => void;

/**
 * Minimal typed pub/sub. Listeners are stored in arrays and iterated by index so
 * emitting does not allocate iterators.
 */
export class EventBus<Events extends object> {
  private readonly listeners = new Map<keyof Events, Listener<never>[]>();

  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    let list = this.listeners.get(type);
    if (!list) {
      list = [];
      this.listeners.set(type, list);
    }
    list.push(listener as Listener<never>);
    return () => this.off(type, listener);
  }

  off<K extends keyof Events>(type: K, listener: Listener<Events[K]>): void {
    const list = this.listeners.get(type);
    if (!list) return;
    const i = list.indexOf(listener as Listener<never>);
    if (i >= 0) list.splice(i, 1);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const list = this.listeners.get(type) as Listener<Events[K]>[] | undefined;
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i]!(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
