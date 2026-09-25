import type { Scene } from 'three';
import type { GraphicsQuality, LevelConfig, RobotConfig } from '../config/types';
import type { EventBus } from '../core/EventBus';
import type { GameEvents, RobotDestroyedEvent, RobotStateEvent } from '../core/GameEvents';
import type { RobotInfo, RobotStateId } from '../core/types';
import type { Maze } from '../maze/Maze';
import type { PhysicsSystem } from '../physics/PhysicsSystem';
import type { PlayerPerception } from '../player/Player';
import { ObjectPool } from '../pooling/ObjectPool';
import type { ObjectPoolManager } from '../pooling/ObjectPoolManager';
import type { Random } from '../utils/Random';
import { Robot } from './Robot';
import { RobotBehaviour } from './RobotBehaviour';
import { RobotWorld } from './RobotContext';
import type { RobotModelFactory } from './RobotModelFactory';
import { planRobotSpawns } from './RobotSpawner';
import { RobotView } from './RobotView';

/**
 * Spawns pooled robots for a level, updates them, and detects when the player is caught.
 * Robot objects (with their meshes/materials) are reused across levels.
 */
export class RobotManager {
  readonly active: Robot[] = [];
  /** Highest suspicion of any robot (0..1), for the HUD detection meter. */
  maxSuspicion = 0;
  chasingCount = 0;
  /** Distance to the closest chasing robot (Infinity if none). */
  nearestChaseDistance = Number.POSITIVE_INFINITY;

  private readonly world = new RobotWorld();
  private readonly behaviour = new RobotBehaviour();
  private readonly pool: ObjectPool<Robot>;
  private readonly stateEvent: RobotStateEvent = { robotId: 0, from: null, to: 'patrol', x: 0, y: 0, z: 0 };
  private readonly destroyedEvent: RobotDestroyedEvent = { robotId: 0, cause: 'hammer', x: 0, y: 0, z: 0 };
  private nextId = 0;
  private caught = false;
  private alertTimer = 0;
  /** A chaser currently sees the player and is radioing the others. */
  private alerting = false;
  private level: LevelConfig | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly physics: PhysicsSystem,
    private readonly events: EventBus<GameEvents>,
    private readonly models: RobotModelFactory,
    private readonly quality: GraphicsQuality,
    private readonly baseConfig: RobotConfig,
    pools: ObjectPoolManager,
  ) {
    this.pool = pools.register(new ObjectPool<Robot>('robots', () => this.createRobot()));
  }

  spawnForLevel(level: LevelConfig, maze: Maze, player: PlayerPerception, rng: Random): void {
    this.clear();
    this.world.maze = maze.data;
    this.world.pathfinder = maze.pathfinder;
    this.world.rng = rng;
    this.world.player = player;
    this.caught = false;
    this.alerting = false;
    this.alertTimer = 0;
    this.level = level;

    const plans = planRobotSpawns(maze.data, maze.pathfinder, level.robotCount, level.ai, rng);
    plans.forEach((plan, i) => {
      const robot = this.pool.acquire();
      if (!robot) return;
      robot.activate({
        physics: this.physics,
        config: level.robot,
        ai: level.ai,
        x: maze.data.centerX(plan.cell),
        z: maze.data.centerZ(plan.cell),
        heading: plan.heading,
        route: plan.route,
        sensorStagger: (i / Math.max(1, plans.length)) / level.ai.sensorHz,
      });
      this.active.push(robot);
    });
  }

  update(dt: number, time: number): void {
    const player = this.world.player;
    let maxSuspicion = 0;
    let chasing = 0;
    let nearest = Number.POSITIVE_INFINITY;

    for (let i = 0; i < this.active.length; i++) {
      const robot = this.active[i]!;
      robot.update(dt, time);

      const p = robot.controller.position;
      const dx = p.x - player.position.x;
      const dz = p.z - player.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (robot.stunned) continue;
      if (robot.sensor.suspicion > maxSuspicion) maxSuspicion = robot.sensor.suspicion;
      if (robot.stateId === 'chase') {
        chasing++;
        if (dist < nearest) nearest = dist;
      }
      if (!this.caught && dist < robot.config.catchRadius) {
        this.caught = true;
        this.events.emit('player:caught', { robotId: robot.id });
      }
    }
    this.maxSuspicion = maxSuspicion;
    this.chasingCount = chasing;
    this.nearestChaseDistance = nearest;
    this.updateRadio(dt);
  }

  /**
   * Pac-Man teamwork: while any chasing robot sees the player, it broadcasts the player's
   * position every `ai.alertIntervalSeconds`; every other robot drops what it is doing and
   * rushes to that spot. Losing sight ends the broadcast (hiding works).
   */
  private updateRadio(dt: number): void {
    const ai = this.level?.ai;
    if (!ai) return;
    let spotter: Robot | null = null;
    for (const r of this.active) {
      if (!r.stunned && r.stateId === 'chase' && r.sensor.canSeePlayer) {
        spotter = r;
        break;
      }
    }
    if (!spotter) {
      this.alerting = false;
      this.alertTimer = 0;
      return;
    }
    this.alertTimer -= dt;
    if (this.alertTimer > 0) return;
    this.alertTimer = ai.alertIntervalSeconds;
    const x = spotter.sensor.lastSeenX;
    const z = spotter.sensor.lastSeenZ;
    let responders = 0;
    for (const r of this.active) {
      if (r === spotter || r.stunned || r.stateId === 'chase') continue;
      r.sensor.hearNoise(x, z, true);
      responders++;
    }
    if (!this.alerting && responders > 0) this.events.emit('robots:alerted', { responders });
    this.alerting = true;
  }

  /**
   * Adds one robot at an exact cell with a given patrol route (scripted encounters, e.g. the
   * tutorial). Must be called after `spawnForLevel`. Returns the robot id, or -1.
   */
  spawnScripted(cell: number, heading: number, route: readonly number[]): number {
    const level = this.level;
    const robot = level ? this.pool.acquire() : null;
    if (!level || !robot) return -1;
    robot.activate({
      physics: this.physics,
      config: level.robot,
      ai: level.ai,
      x: this.world.maze.centerX(cell),
      z: this.world.maze.centerZ(cell),
      heading,
      route,
      sensorStagger: 0,
    });
    this.active.push(robot);
    return robot.id;
  }

  /** Re-arms catch detection after a scripted retry (the player was moved to safety). */
  resetCaught(): void {
    this.caught = false;
  }

  /** Permanently removes a robot from this level (weapon kill). Returns false if it is not active. */
  destroy(robotId: number, cause: RobotDestroyedEvent['cause']): boolean {
    const i = this.active.findIndex((r) => r.id === robotId);
    if (i < 0) return false;
    const robot = this.active[i]!;
    const e = this.destroyedEvent;
    const p = robot.controller.position;
    e.robotId = robot.id;
    e.cause = cause;
    e.x = p.x;
    e.y = robot.config.height * 0.6;
    e.z = p.z;
    robot.deactivate();
    this.pool.release(robot);
    this.active.splice(i, 1);
    this.events.emit('robot:destroyed', e);
    return true;
  }

  /**
   * Paralyses every active robot within `radius` of (x, z) for `seconds` (robot nullifier).
   * Returns how many were hit.
   */
  stunWithin(x: number, z: number, radius: number, seconds: number): number {
    const r2 = radius * radius;
    let hit = 0;
    for (const robot of this.active) {
      const p = robot.controller.position;
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz > r2) continue;
      robot.stun(seconds);
      hit++;
    }
    return hit;
  }

  /** Returns every active robot to the pool. */
  clear(): void {
    for (const r of this.active) {
      r.deactivate();
      this.pool.release(r);
    }
    this.active.length = 0;
    this.maxSuspicion = 0;
    this.chasingCount = 0;
    this.nearestChaseDistance = Number.POSITIVE_INFINITY;
  }

  /** Active robots as read-only info (no allocation). */
  get robots(): readonly RobotInfo[] {
    return this.active;
  }

  private createRobot(): Robot {
    const id = this.nextId++;
    const view = new RobotView(this.models, this.baseConfig, this.quality.robotLights, id);
    this.scene.add(view.root);
    return new Robot(id, view, this.world, this.behaviour, this.onStateChange);
  }

  private readonly onStateChange = (robot: Robot, from: RobotStateId | null, to: RobotStateId): void => {
    const e = this.stateEvent;
    const p = robot.controller.position;
    e.robotId = robot.id;
    e.from = from;
    e.to = to;
    e.x = p.x;
    e.y = 1.7;
    e.z = p.z;
    this.events.emit('robot:stateChanged', e);
  };

  dispose(): void {
    this.clear();
    this.pool.drain((r) => r.view.dispose());
  }
}
