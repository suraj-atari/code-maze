import type { Scene } from 'three';
import type { ArmoryConfig, LootKind, MazeConfig } from '../config/types';
import type { EventBus } from '../core/EventBus';
import type { GameEvents, PositionEvent } from '../core/GameEvents';
import type { RobotInfo } from '../core/types';
import type { MazeData } from '../maze/MazeData';
import type { PhysicsSystem } from '../physics/PhysicsSystem';
import type { PlayerPerception } from '../player/Player';
import type { Random } from '../utils/Random';
import type { WeaponModels } from '../weapons/WeaponModels';
import { Armory } from './Armory';
import { ArmoryAssets } from './ArmoryAssets';
import { planArmories, type ArmorySite } from './ArmoryPlanner';

/**
 * Places sealed rooms in dead ends for each wing, opens doors on interact (robots barge through
 * them too), and hands out the loot (weapons, nullifier, keycard) when the player reaches a cache.
 */
export class ArmoryManager {
  readonly armories: Armory[] = [];
  /** True while the player stands at a closed door (drives the HUD prompt). */
  promptVisible = false;
  /** Kind of room behind the door the prompt is for. */
  promptKind: LootKind = 'weapons';

  private readonly assets: ArmoryAssets;
  private readonly doorEvent: PositionEvent = { x: 0, y: 1.3, z: 0 };

  constructor(
    private readonly scene: Scene,
    private readonly physics: PhysicsSystem,
    private readonly models: WeaponModels,
    private readonly events: EventBus<GameEvents>,
    private readonly config: ArmoryConfig,
    mazeConfig: MazeConfig,
    private readonly interactDistance: number,
  ) {
    this.assets = new ArmoryAssets(mazeConfig);
  }

  /** @param fixed exact sites (scripted levels); otherwise dead ends are chosen at random */
  spawnForLevel(maze: MazeData, rng: Random, fixed?: readonly ArmorySite[]): void {
    this.clear();
    for (const site of fixed ?? planArmories(maze, this.config, rng)) {
      const armory = new Armory(site, maze, this.assets, this.models, this.physics);
      this.scene.add(armory.root);
      this.armories.push(armory);
    }
  }

  /** True if this wing has a keycard room (the exit is locked until it is looted). */
  get hasKeycard(): boolean {
    return this.armories.some((a) => a.loot === 'keycard');
  }

  clear(): void {
    for (const a of this.armories) a.dispose();
    this.armories.length = 0;
    this.promptVisible = false;
  }

  update(
    dt: number,
    time: number,
    player: PlayerPerception,
    interactPressed: boolean,
    robots: readonly RobotInfo[],
  ): void {
    const p = player.position;
    let prompt = false;
    for (const a of this.armories) {
      if (a.closed) {
        const near = Math.hypot(p.x - a.doorX, p.z - a.doorZ) <= this.interactDistance;
        if (near && interactPressed) this.open(a);
        else if (near) {
          prompt = true;
          this.promptKind = a.loot;
        }
        else if (this.robotAtDoor(a, robots)) this.open(a);
      }
      a.update(dt, time, this.config.doorOpenSeconds);

      if (a.lootable && Math.hypot(p.x - a.cacheX, p.z - a.cacheZ) <= this.config.pickupRadius) {
        a.markLooted();
        if (a.loot === 'nullifier') this.events.emit('pickup:nullifier', { charges: this.config.nullifierCharges });
        else if (a.loot === 'keycard') this.events.emit('pickup:keycard', undefined);
        else this.events.emit('armory:looted', { ...this.config.loot });
      }
    }
    this.promptVisible = prompt;
  }

  /** True if a closed door occupies the point. */
  blocks(x: number, z: number): boolean {
    for (const a of this.armories) if (a.blocks(x, z)) return true;
    return false;
  }

  private robotAtDoor(a: Armory, robots: readonly RobotInfo[]): boolean {
    const r2 = this.config.robotOpenDistance ** 2;
    for (const r of robots) {
      const dx = r.position.x - a.doorX;
      const dz = r.position.z - a.doorZ;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }

  private open(a: Armory): void {
    if (!a.open()) return;
    this.doorEvent.x = a.doorX;
    this.doorEvent.z = a.doorZ;
    this.events.emit('armory:doorOpened', this.doorEvent);
  }

  dispose(): void {
    this.clear();
    this.assets.dispose();
  }
}
