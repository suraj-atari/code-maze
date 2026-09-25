import type { Object3D } from 'three';

/** Per-frame state the third-person character is animated from. */
export interface AvatarPose {
  /** Horizontal speed in m/s. */
  speed: number;
  sprinting: boolean;
  crouching: boolean;
  /** Camera pitch (radians, + = up): the head and lamp follow it. */
  pitch: number;
  hasHammer: boolean;
  /** 0..1 lamp output, lights up the chest lamp lens. */
  lamp: number;
  /** Yaw change in rad/s (+ = turning left): the body leans into turns. */
  turnRate: number;
}

/**
 * A visible, animated player character. Model faces -Z with its feet at the origin; the owner
 * positions and yaws `root`. Implemented procedurally or from a GLB (see PlayerModelFactory).
 */
export interface PlayerRig {
  readonly root: Object3D;
  /** Chest-mounted lamp mount point; its -Z axis follows the look pitch. */
  readonly lampAnchor: Object3D;
  update(pose: Readonly<AvatarPose>, dt: number, time: number): void;
  /** Plays the hammer strike. */
  swing(): void;
  /** Plays the grenade throw. */
  throwGrenade(): void;
  dispose(): void;
}
