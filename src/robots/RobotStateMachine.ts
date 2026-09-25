/**
 * A state reads the context and returns the id of the state to switch to, or null to stay.
 * States should be stateless (per-agent data lives in the context) so one instance can be
 * shared by every agent.
 */
export interface State<TContext, TId extends string> {
  readonly id: TId;
  enter(ctx: TContext): void;
  update(ctx: TContext, dt: number): TId | null;
  exit(ctx: TContext): void;
}

export type StateChangeHandler<TId extends string> = (from: TId | null, to: TId) => void;

/** Generic finite state machine — transitions are data returned by states, not nested ifs. */
export class StateMachine<TContext, TId extends string> {
  private readonly states = new Map<TId, State<TContext, TId>>();
  private current: State<TContext, TId> | null = null;

  constructor(
    private readonly ctx: TContext,
    private readonly onChange?: StateChangeHandler<TId>,
  ) {}

  get currentId(): TId | null {
    return this.current?.id ?? null;
  }

  register(state: State<TContext, TId>): this {
    this.states.set(state.id, state);
    return this;
  }

  change(id: TId): void {
    const next = this.states.get(id);
    if (!next) throw new Error(`[StateMachine] unknown state "${id}"`);
    const prev = this.current;
    prev?.exit(this.ctx);
    this.current = next;
    next.enter(this.ctx);
    this.onChange?.(prev?.id ?? null, id);
  }

  update(dt: number): void {
    if (!this.current) return;
    const next = this.current.update(this.ctx, dt);
    if (next !== null && next !== this.current.id) this.change(next);
  }

  /** Leaves the current state without entering another (used when an agent is pooled). */
  stop(): void {
    this.current?.exit(this.ctx);
    this.current = null;
  }
}
