import type { AIConfig } from '../config/types';
import type { Vec3Like } from '../core/types';
import { DEG2RAD } from '../utils/math';
import type { RobotWorld } from './RobotContext';
import type { RobotController } from './RobotController';

/**
 * Vision + hearing. Evaluated at `ai.sensorHz` (staggered per robot), not every frame.
 *  - Vision: cone (FOV) × range, range shrinks when the player's lamp is off or they crouch;
 *    blocked by walls (grid line-of-sight); short proximity sense ignores facing.
 *  - Suspicion builds while the player is visible (faster when close) and decays otherwise;
 *    with `ai.chaseOnSight` any sighting is instantly certain (straight to Chase).
 *  - Hearing: player noise radius × robot hearing, attenuated through walls. Latched until consumed.
 *    Radio alerts from other robots arrive through `hearNoise(…, urgent)`.
 */
export class RobotSensor {
  canSeePlayer = false;
  distanceToPlayer = Number.POSITIVE_INFINITY;
  /** 0..1 — reaching 1 means the robot is certain it saw the player. */
  suspicion = 0;
  lastSeenX = 0;
  lastSeenZ = 0;
  noiseX = 0;
  noiseZ = 0;
  private noisePending = false;
  /** The pending noise is a radio alert from another robot (answer it in a hurry). */
  noiseUrgent = false;
  private accumulator = 0;
  private losState = -1;

  reset(stagger: number): void {
    this.canSeePlayer = false;
    this.distanceToPlayer = Number.POSITIVE_INFINITY;
    this.suspicion = 0;
    this.noisePending = false;
    this.accumulator = stagger;
  }

  get alerted(): boolean {
    return this.suspicion >= 1;
  }

  /** Returns true once per heard noise. */
  consumeNoise(): boolean {
    const had = this.noisePending;
    this.noisePending = false;
    return had;
  }

  /**
   * An external loud noise (e.g. an explosion) the robot should investigate.
   * @param urgent a radio alert from another robot that has the player in sight
   */
  hearNoise(x: number, z: number, urgent = false): void {
    this.noisePending = true;
    this.noiseUrgent = urgent;
    this.noiseX = x;
    this.noiseZ = z;
  }

  update(dt: number, controller: RobotController, world: RobotWorld, ai: AIConfig): void {
    this.accumulator += dt;
    const interval = 1 / ai.sensorHz;
    if (this.accumulator < interval) return;
    const tickDt = this.accumulator;
    this.accumulator = 0;
    this.evaluate(tickDt, controller, world, ai);
  }

  private evaluate(dt: number, controller: RobotController, world: RobotWorld, ai: AIConfig): void {
    const player = world.player;
    const p = player.position;
    const r = controller.position;
    const dx = p.x - r.x;
    const dz = p.z - r.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    this.distanceToPlayer = dist;

    let range = ai.visionRange;
    if (!player.lampOn) range *= ai.darkVisionFactor;
    if (player.crouching) range *= ai.crouchVisionFactor;

    this.losState = -1;
    let visible = false;
    if (dist <= ai.proximityRadius) {
      visible = this.hasLos(world, r, p);
    } else if (dist <= range) {
      const fx = Math.sin(controller.heading);
      const fz = Math.cos(controller.heading);
      const cosAngle = (dx * fx + dz * fz) / dist;
      if (cosAngle >= Math.cos(ai.visionFovDeg * 0.5 * DEG2RAD)) visible = this.hasLos(world, r, p);
    }

    this.canSeePlayer = visible;
    if (visible) {
      const closeness = 1 - Math.min(1, dist / Math.max(range, 0.01));
      // Pac-Man rules: one look and it comes for you.
      this.suspicion = ai.chaseOnSight
        ? 1
        : Math.min(1, this.suspicion + ai.suspicionGain * dt * (0.5 + 1.5 * closeness));
      this.lastSeenX = p.x;
      this.lastSeenZ = p.z;
    } else {
      this.suspicion = Math.max(0, this.suspicion - ai.suspicionDecay * dt);
    }

    if (player.noiseRadius > 0) {
      let hearing = player.noiseRadius * ai.hearingMultiplier;
      if (dist <= hearing && !this.hasLos(world, r, p)) hearing *= ai.occludedHearingFactor;
      if (dist <= hearing) {
        this.noisePending = true;
        this.noiseUrgent = false;
        this.noiseX = p.x;
        this.noiseZ = p.z;
      }
    }
  }

  /** Lazily evaluated, cached for the current tick (-1 unknown, 0 blocked, 1 clear). */
  private hasLos(world: RobotWorld, r: Vec3Like, p: Readonly<Vec3Like>): boolean {
    if (this.losState < 0) this.losState = world.maze.hasLineOfSight(r.x, r.z, p.x, p.z) ? 1 : 0;
    return this.losState === 1;
  }
}
