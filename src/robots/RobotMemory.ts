export const Phase = {
  Moving: 0,
  Looking: 1,
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

/** Per-robot blackboard used by the (stateless, shared) behaviour states. */
export class RobotMemory {
  targetX = 0;
  targetZ = 0;
  phase: Phase = Phase.Moving;
  /** General purpose countdown owned by the current state. */
  timer = 0;
  /** Secondary countdown owned by the current state. */
  subTimer = 0;
  lookTime = 0;
  lookBase = 0;
  lostSightTimer = 0;
  repathTimer = 0;
  route = new Int32Array(8);
  routeLength = 0;
  routeIndex = 0;

  setTarget(x: number, z: number): void {
    this.targetX = x;
    this.targetZ = z;
  }

  setRoute(cells: readonly number[]): void {
    if (this.route.length < cells.length) this.route = new Int32Array(cells.length);
    for (let i = 0; i < cells.length; i++) this.route[i] = cells[i]!;
    this.routeLength = cells.length;
    this.routeIndex = 0;
  }

  reset(): void {
    this.phase = Phase.Moving;
    this.timer = this.subTimer = this.lookTime = this.lookBase = 0;
    this.lostSightTimer = this.repathTimer = 0;
    this.routeIndex = 0;
  }
}
