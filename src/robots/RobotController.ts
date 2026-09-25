import type { RobotConfig } from '../config/types';
import type { PhysicsSystem, RigidBody } from '../physics/PhysicsSystem';
import { clamp, wrapAngle } from '../utils/math';
import type { RobotWorld } from './RobotContext';

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Locomotion for a robot: follows grid paths from the shared Pathfinder, turns smoothly,
 * slows down while turning, and drives a kinematic Rapier body so the player collides with it.
 * Heading convention: model faces +Z, forward = (sin h, cos h).
 */
export class RobotController {
  readonly position = { x: 0, y: 0, z: 0 };
  heading = 0;
  arrived = true;
  /** Current actual speed (m/s), for animation/audio. */
  currentSpeed = 0;

  private path = new Int32Array(0);
  private pathLen = 0;
  private pathIdx = 0;
  private finalX = 0;
  private finalZ = 0;
  private speed = 0;
  private body: RigidBody | null = null;
  private physics: PhysicsSystem | null = null;
  private readonly bodyPos = { x: 0, y: 0, z: 0 };
  private world!: RobotWorld;
  private config!: RobotConfig;

  bind(world: RobotWorld, config: RobotConfig): void {
    this.world = world;
    this.config = config;
    if (this.path.length < world.maze.cellCount) this.path = new Int32Array(world.maze.cellCount);
  }

  spawn(physics: PhysicsSystem, x: number, z: number, heading: number): void {
    this.despawn();
    this.physics = physics;
    const c = this.config;
    this.position.x = x;
    this.position.z = z;
    this.heading = heading;
    this.arrived = true;
    this.pathLen = 0;
    this.body = physics.createKinematicCapsule(x, c.height / 2, z, Math.max(0.05, c.height / 2 - c.radius), c.radius).body;
  }

  despawn(): void {
    if (this.body && this.physics) this.physics.removeBody(this.body);
    this.body = null;
  }

  get currentCell(): number {
    return this.world.maze.cellAt(this.position.x, this.position.z);
  }

  /** Paths to the centre of `cell`. Returns false if unreachable. */
  moveToCell(cell: number, speed: number): boolean {
    const maze = this.world.maze;
    const len = this.world.pathfinder.findPath(this.currentCell, cell, this.path);
    if (len < 0) {
      this.stop();
      return false;
    }
    this.pathLen = len;
    this.pathIdx = 0;
    this.finalX = maze.centerX(cell);
    this.finalZ = maze.centerZ(cell);
    this.speed = speed;
    this.arrived = false;
    return true;
  }

  /**
   * Paths to an exact world point. A point inside a wall (the player hiding in a lab room) sends
   * the robot to the walkable cell next to it instead, where it waits at the door.
   */
  moveToPoint(x: number, z: number, speed: number): boolean {
    const maze = this.world.maze;
    const cell = maze.cellAt(x, z);
    if (cell < 0) return false;
    if (!maze.isWalkable(cell)) {
      const cx = maze.cellX(cell);
      const cy = maze.cellY(cell);
      for (const [dx, dy] of NEIGHBOURS) {
        if (maze.isWall(cx + dx, cy + dy)) continue;
        return this.moveToCell(maze.index(cx + dx, cy + dy), speed);
      }
      return false;
    }
    if (!this.moveToCell(cell, speed)) return false;
    this.finalX = x;
    this.finalZ = z;
    return true;
  }

  stop(): void {
    this.arrived = true;
    this.pathLen = 0;
  }

  /** Smoothly rotates towards an absolute heading. */
  turnTowards(target: number, dt: number, speedFactor = 1): void {
    const diff = wrapAngle(target - this.heading);
    const maxStep = this.config.turnSpeed * speedFactor * dt;
    this.heading = wrapAngle(this.heading + clamp(diff, -maxStep, maxStep));
  }

  update(dt: number): void {
    this.currentSpeed = 0;
    if (!this.arrived) this.followPath(dt);
    if (this.body) {
      this.bodyPos.x = this.position.x;
      this.bodyPos.y = this.config.height / 2;
      this.bodyPos.z = this.position.z;
      this.body.setNextKinematicTranslation(this.bodyPos);
    }
  }

  private followPath(dt: number): void {
    const maze = this.world.maze;
    let tx: number;
    let tz: number;
    const last = this.pathIdx >= this.pathLen - 1;
    if (last) {
      tx = this.finalX;
      tz = this.finalZ;
    } else {
      const cell = this.path[this.pathIdx]!;
      tx = maze.centerX(cell);
      tz = maze.centerZ(cell);
    }

    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.08) {
      if (last) this.arrived = true;
      else this.pathIdx++;
      return;
    }

    const desired = Math.atan2(dx, dz);
    this.turnTowards(desired, dt);
    // Slow down when facing away from the travel direction (turn first, then drive).
    const facing = Math.cos(wrapAngle(desired - this.heading));
    const factor = clamp((facing - 0.2) / 0.8, 0, 1);
    const step = Math.min(dist, this.speed * factor * dt);
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    this.currentSpeed = dt > 0 ? step / dt : 0;
  }
}
