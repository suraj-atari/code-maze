export type FrameCallback = (dt: number, elapsed: number) => void;

/** requestAnimationFrame loop with a clamped delta so tab switches don't explode the simulation. */
export class GameLoop {
  private rafId = 0;
  private last = 0;
  private running = false;
  private elapsed = 0;

  constructor(
    private readonly onFrame: FrameCallback,
    private readonly maxDelta = 1 / 20,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > this.maxDelta) dt = this.maxDelta;
    else if (dt < 0) dt = 0;
    this.elapsed += dt;
    this.onFrame(dt, this.elapsed);
  };
}
