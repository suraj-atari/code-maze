/** Small shared types used across layers. Kept dependency-free on purpose. */

export type RobotStateId = 'patrol' | 'investigate' | 'search' | 'chase' | 'return';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Read-only view of a robot for HUD, audio and debug consumers. */
export interface RobotInfo {
  readonly id: number;
  readonly stateId: RobotStateId;
  readonly position: Readonly<Vec3Like>;
  /** 0..1 */
  readonly suspicion: number;
}

export interface Disposable {
  dispose(): void;
}
