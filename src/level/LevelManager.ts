import type { Scene } from 'three';
import type { ArmoryManager } from '../armory/ArmoryManager';
import type { MazeTextures } from '../maze/MazeRenderer';
import type { LevelConfig } from '../config/types';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { LampLight } from '../lighting/LampLight';
import type { LightingSystem } from '../lighting/LightingSystem';
import { firstOpenNeighbour } from '../maze/MazeAnalysis';
import { Maze } from '../maze/Maze';
import type { PhysicsSystem } from '../physics/PhysicsSystem';
import type { Player } from '../player/Player';
import type { RobotManager } from '../robots/RobotManager';
import { Random } from '../utils/Random';
import type { Weapons } from '../weapons/Weapons';
import { EmpCaches } from './EmpCaches';
import { ExitZone } from './ExitZone';
import { Level } from './Level';

export interface LevelManagerDeps {
  readonly scene: Scene;
  readonly physics: PhysicsSystem;
  readonly textures: MazeTextures;
  readonly shadows: boolean;
  readonly player: Player;
  readonly lampLight: LampLight;
  readonly robots: RobotManager;
  readonly lighting: LightingSystem;
  readonly armory: ArmoryManager;
  readonly weapons: Weapons;
  readonly events: EventBus<GameEvents>;
  /** Fraction of lab rooms holding an EMP cell. */
  readonly labRoomNullifierShare: number;
}

/**
 * Builds and tears down levels from a resolved LevelConfig: maze (data/visuals/physics),
 * exit, armories, player spawn, weapons, robots and global lighting. Also evaluates the exit/win condition.
 */
export class LevelManager {
  private level: Level | null = null;
  /** True while the player is close enough to the exit to see the "escape" prompt. */
  exitPromptVisible = false;
  private lockedNoticeCooldown = 0;
  private readonly empCaches: EmpCaches;

  constructor(private readonly deps: LevelManagerDeps) {
    this.empCaches = new EmpCaches(deps.scene, deps.events);
    deps.events.on('pickup:keycard', () => {
      if (!this.level) return;
      this.level.hasKeycard = true;
      this.level.exit.setLocked(false);
    });
  }

  get current(): Level | null {
    return this.level;
  }

  /** @param carryOver keep the player's supplies (next wing of the same run) */
  load(config: LevelConfig, carryOver = false): Level {
    this.unload();
    const d = this.deps;
    const rng = new Random(config.seed);

    const maze = Maze.build({
      rooms: config.mazeRooms,
      config: config.maze,
      textures: d.textures,
      shadows: d.shadows,
      physics: d.physics,
      rng,
    });
    d.scene.add(maze.renderer.root);

    d.lighting.setDarkness(config.darkness);
    maze.renderer.setEmissiveIntensity(d.lighting.wallEmissive);

    const exit = new ExitZone(maze.data, config.maze.wallHeight);
    d.scene.add(exit.root);

    const data = maze.data;
    const start = data.startCell;
    const open = firstOpenNeighbour(data, start);
    const yaw =
      open >= 0 ? Math.atan2(-(data.centerX(open) - data.centerX(start)), -(data.centerZ(open) - data.centerZ(start))) : 0;
    d.player.spawn(data.centerX(start), data.centerZ(start), yaw);
    d.player.lamp.reset(config.lamp, true);
    d.lampLight.configure(config.lamp);
    // A new run starts with a full set of EMP pulses (not in the scripted training).
    d.weapons.startLevel(data, config.maze.wallHeight, carryOver, !config.tutorial);

    d.armory.spawnForLevel(data, rng, config.fixedArmories);
    if (!config.tutorial) this.empCaches.spawn(data, maze.chambers, d.labRoomNullifierShare, config.seed);

    d.robots.spawnForLevel(config, maze, d.player, rng);

    this.level = new Level(config, maze, exit, rng);
    this.level.keycardRequired = d.armory.hasKeycard;
    exit.setLocked(this.level.exitLocked);
    this.exitPromptVisible = false;
    d.events.emit('level:loaded', {
      levelIndex: config.levelIndex,
      difficultyLabel: config.difficulty.label,
      tutorial: config.tutorial === true,
    });
    return this.level;
  }

  unload(): void {
    if (!this.level) return;
    this.deps.robots.clear();
    this.deps.armory.clear();
    this.empCaches.clear();
    this.deps.weapons.clear();
    this.deps.player.despawn();
    this.deps.lighting.clearFlashes();
    this.level.dispose();
    this.level = null;
    this.exitPromptVisible = false;
    this.deps.events.emit('level:unloaded', undefined);
  }

  /** Checks the exit. Walking into the gate or pressing interact nearby completes the level. */
  update(dt: number, time: number, interactPressed: boolean): void {
    const level = this.level;
    if (!level || level.completed) return;
    level.elapsed += dt;
    level.exit.update(time);
    this.lockedNoticeCooldown -= dt;

    const p = this.deps.player.position;
    level.maze.renderer.update(dt, p.x, p.z);
    this.empCaches.update(time, p.x, p.z);
    const dist = level.exit.distanceTo(p.x, p.z);
    this.exitPromptVisible = dist <= level.config.player.interactDistance;
    const entering = dist < level.maze.data.cellSize * 0.3 || (this.exitPromptVisible && interactPressed);
    if (entering && level.exitLocked) {
      if (this.lockedNoticeCooldown <= 0) {
        this.lockedNoticeCooldown = 2.5;
        this.deps.events.emit('level:exitLocked', undefined);
      }
      return;
    }
    if (entering) {
      level.completed = true;
      this.exitPromptVisible = false;
      this.deps.events.emit('level:exitReached', undefined);
    }
  }
}
