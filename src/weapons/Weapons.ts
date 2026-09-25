import type { Object3D, PerspectiveCamera, Scene } from 'three';
import type { WeaponsConfig } from '../config/types';
import type { EventBus } from '../core/EventBus';
import type { GameEvents, NullifierPulseEvent, PositionEvent } from '../core/GameEvents';
import type { InputState } from '../input/InputState';
import type { MazeData } from '../maze/MazeData';
import type { Player } from '../player/Player';
import type { RobotManager } from '../robots/RobotManager';
import { DEG2RAD } from '../utils/math';
import { HammerViewModel } from './HammerViewModel';
import type { WeaponModels } from './WeaponModels';

/** Max simultaneous grenades in flight. */
const MAX_PROJECTILES = 4;
/** Robots within this distance of a blast hear it and come to investigate. */
const BLAST_HEARING = 22;
const MAX_SUBSTEP = 1 / 120;

class Grenade {
  active = false;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  fuse = 0;

  constructor(readonly mesh: Object3D) {
    mesh.visible = false;
  }
}

/** Solid things that are not part of the maze grid (e.g. closed doors). */
export interface Obstacles {
  blocks(x: number, z: number): boolean;
}

export interface WeaponsDeps {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly player: Player;
  readonly robots: RobotManager;
  readonly models: WeaponModels;
  readonly obstacles: Obstacles;
  readonly events: EventBus<GameEvents>;
  readonly config: WeaponsConfig;
}

/**
 * The player's arsenal, looted from sealed rooms: a hammer (melee, limited hits), grenades
 * (thrown, bounce off walls, detonate on a fuse or on hitting a robot; the blast destroys every
 * robot in radius with line of sight and draws the others in) and robot nullifier charges
 * (an EMP pulse that paralyses every robot nearby for a few seconds).
 * Inventory carries over from wing to wing and resets when a run starts.
 */
export class Weapons {
  grenades = 0;
  hammerHits = 0;
  nullifiers = 0;
  /** The hand-held hammer view model is only drawn in the first-person view. */
  firstPerson = true;

  private maze: MazeData | null = null;
  private wallHeight = 3;
  private hammerCooldown = 0;
  private throwCooldown = 0;
  private nullifyCooldown = 0;
  private readonly pulseEvent: NullifierPulseEvent = { x: 0, y: 1, z: 0, stunned: 0, seconds: 0 };
  private time = 0;
  private readonly projectiles: Grenade[] = [];
  private readonly view: HammerViewModel;
  private readonly hitIds: number[] = [];
  private readonly posEvent: PositionEvent = { x: 0, y: 0, z: 0 };

  constructor(private readonly deps: WeaponsDeps) {
    this.view = new HammerViewModel(deps.camera, deps.models);
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const g = new Grenade(deps.models.grenade());
      deps.scene.add(g.mesh);
      this.projectiles.push(g);
    }
    deps.events.on('armory:looted', ({ grenades, hammerHits }) => this.grant(grenades, hammerHits));
    deps.events.on('pickup:nullifier', ({ charges }) => {
      this.nullifiers = Math.min(deps.config.nullifier.maxCharges, this.nullifiers + charges);
    });
  }

  /** Adds supplies directly (tutorial top-ups), capped like armory loot. */
  grant(grenades: number, hammerHits: number): void {
    const c = this.deps.config;
    this.grenades = Math.min(c.maxGrenades, this.grenades + grenades);
    this.hammerHits = Math.min(c.maxHammerHits, this.hammerHits + hammerHits);
  }

  get grenadesInFlight(): number {
    let n = 0;
    for (const g of this.projectiles) if (g.active) n++;
    return n;
  }

  /** @param keepInventory carry supplies into the next wing of a run */
  /** @param startKit a fresh inventory starts with `nullifier.startCharges` EMP pulses */
  startLevel(maze: MazeData, wallHeight: number, keepInventory = false, startKit = false): void {
    const kept = [this.grenades, this.hammerHits, this.nullifiers] as const;
    this.clear();
    if (keepInventory) [this.grenades, this.hammerHits, this.nullifiers] = kept;
    else if (startKit) this.nullifiers = this.deps.config.nullifier.startCharges;
    this.maze = maze;
    this.wallHeight = wallHeight;
  }

  /** Drops inventory and any grenades in flight. */
  clear(): void {
    this.maze = null;
    this.grenades = 0;
    this.hammerHits = 0;
    this.nullifiers = 0;
    this.hammerCooldown = this.throwCooldown = this.nullifyCooldown = 0;
    for (const g of this.projectiles) {
      g.active = false;
      g.mesh.visible = false;
    }
    this.view.hide();
  }

  update(dt: number, input: InputState): void {
    if (!this.maze) return;
    this.time += dt;
    this.hammerCooldown -= dt;
    this.throwCooldown -= dt;
    this.nullifyCooldown -= dt;

    if (input.attackPressed) this.tryHammer();
    if (input.throwPressed) this.tryThrow();
    if (input.nullifyPressed) this.tryNullify();

    this.updateProjectiles(dt);
    this.deps.models.ledMaterial.color.setHex(Math.sin(this.time * 18) > 0 ? 0xff2a1a : 0x300604);
    this.deps.models.setViewBrightness(0.18 + 0.82 * this.deps.player.lamp.output);
    this.view.update(dt, this.time, this.hammerHits > 0 && this.firstPerson, this.deps.player.moveFactor);
  }

  // ------------------------------------------------------------------ nullifier

  private tryNullify(): void {
    const { events, config, player, robots } = this.deps;
    if (this.nullifiers <= 0) {
      events.emit('weapon:empty', { weapon: 'nullifier' });
      return;
    }
    if (this.nullifyCooldown > 0) return;
    const n = config.nullifier;
    this.nullifiers--;
    this.nullifyCooldown = n.cooldown;
    const p = player.position;
    const e = this.pulseEvent;
    e.x = p.x;
    e.y = 1;
    e.z = p.z;
    e.seconds = n.stunSeconds;
    e.stunned = robots.stunWithin(p.x, p.z, n.radius, n.stunSeconds);
    events.emit('weapon:nullifierPulse', e);
  }

  // ------------------------------------------------------------------ hammer

  private tryHammer(): void {
    const { events, config, player } = this.deps;
    if (this.hammerHits <= 0) {
      events.emit('weapon:empty', { weapon: 'hammer' });
      return;
    }
    if (this.hammerCooldown > 0) return;
    this.hammerCooldown = config.hammer.cooldown;
    this.view.swing();
    events.emit('weapon:hammerSwing', undefined);

    // Nearest robot inside the reach cone in front of the player, not behind a wall.
    const p = player.position;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const minCos = Math.cos(config.hammer.coneDeg * 0.5 * DEG2RAD);
    let bestId = -1;
    let bestDist = config.hammer.reach;
    let hitX = 0;
    let hitZ = 0;
    for (const r of this.deps.robots.robots) {
      const dx = r.position.x - p.x;
      const dz = r.position.z - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > bestDist) continue;
      if (d > 0.3 && (dx * fx + dz * fz) / d < minCos) continue;
      if (!this.maze!.hasLineOfSight(p.x, p.z, r.position.x, r.position.z)) continue;
      bestId = r.id;
      bestDist = d;
      hitX = r.position.x;
      hitZ = r.position.z;
    }
    if (bestId < 0) return;

    this.hammerHits--;
    const e = this.posEvent;
    e.x = hitX;
    e.y = 1.2;
    e.z = hitZ;
    events.emit('weapon:hammerHit', e);
    this.deps.robots.destroy(bestId, 'hammer');
  }

  // ------------------------------------------------------------------ grenades

  private tryThrow(): void {
    const { events, config, camera, player } = this.deps;
    if (this.grenades <= 0) {
      events.emit('weapon:empty', { weapon: 'grenade' });
      return;
    }
    if (this.throwCooldown > 0) return;
    const g = this.projectiles.find((p) => !p.active);
    if (!g) return;
    this.throwCooldown = config.grenade.cooldown;
    this.grenades--;

    const e = camera.matrixWorld.elements;
    // Camera forward is -Z in camera space: column 2 of the world matrix, negated.
    const fx = -e[8]!;
    const fy = -e[9]!;
    const fz = -e[10]!;
    const c = config.grenade;
    // Thrown from the player's head along the view direction (the camera may be behind the
    // player in third person).
    const p = player.position;
    g.x = p.x + fx * 0.35;
    g.y = p.y + player.eyeHeight - 0.15;
    g.z = p.z + fz * 0.35;
    if (this.solid(g.x, g.z)) {
      g.x = p.x;
      g.z = p.z;
    }
    g.vx = fx * c.throwSpeed;
    g.vy = fy * c.throwSpeed + c.throwLift;
    g.vz = fz * c.throwSpeed;
    g.fuse = c.fuseSeconds;
    g.active = true;
    g.mesh.visible = true;
    g.mesh.position.set(g.x, g.y, g.z);
    events.emit('weapon:grenadeThrown', undefined);
  }

  private solid(x: number, z: number): boolean {
    const m = this.maze!;
    const s = m.cellSize;
    return m.isWall(Math.floor(x / s), Math.floor(z / s)) || this.deps.obstacles.blocks(x, z);
  }

  private updateProjectiles(dt: number): void {
    const c = this.deps.config.grenade;
    const r = c.radius;
    const top = this.wallHeight - r;
    for (const g of this.projectiles) {
      if (!g.active) continue;
      let impact = 0;
      let remaining = dt;
      while (remaining > 0) {
        const h = Math.min(MAX_SUBSTEP, remaining);
        remaining -= h;
        g.vy -= c.gravity * h;

        // Axis-separated wall collision against the maze grid (the grenade's leading edge).
        const nx = g.x + g.vx * h;
        if (this.solid(nx + Math.sign(g.vx) * r, g.z)) {
          impact = Math.max(impact, Math.abs(g.vx));
          g.vx = -g.vx * c.bounce;
        } else g.x = nx;
        const nz = g.z + g.vz * h;
        if (this.solid(g.x, nz + Math.sign(g.vz) * r)) {
          impact = Math.max(impact, Math.abs(g.vz));
          g.vz = -g.vz * c.bounce;
        } else g.z = nz;

        g.y += g.vy * h;
        if (g.y < r) {
          g.y = r;
          if (g.vy < -1) impact = Math.max(impact, -g.vy);
          g.vy = Math.abs(g.vy) < 1 ? 0 : -g.vy * c.bounce;
          // Rolling friction.
          const f = Math.exp(-4 * h);
          g.vx *= f;
          g.vz *= f;
        } else if (g.y > top) {
          g.y = top;
          g.vy = -Math.abs(g.vy) * c.bounce;
        }
      }

      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.rotation.x += g.vz * dt * 4;
      g.mesh.rotation.z -= g.vx * dt * 4;
      if (impact > 1.5) this.emitAt('weapon:grenadeBounce', g.x, g.y, g.z);

      g.fuse -= dt;
      if (g.fuse <= 0 || this.touchesRobot(g)) this.explode(g);
    }
  }

  private touchesRobot(g: Grenade): boolean {
    for (const robot of this.deps.robots.active) {
      const p = robot.position;
      const reach = robot.config.radius + this.deps.config.grenade.radius + 0.1;
      if (g.y < robot.config.height && Math.hypot(p.x - g.x, p.z - g.z) < reach) return true;
    }
    return false;
  }

  private explode(g: Grenade): void {
    g.active = false;
    g.mesh.visible = false;
    this.emitAt('weapon:explosion', g.x, g.y + 0.3, g.z);

    const maze = this.maze!;
    const radius = this.deps.config.grenade.blastRadius;
    const ids = this.hitIds;
    ids.length = 0;
    for (const robot of this.deps.robots.active) {
      const p = robot.position;
      const d = Math.hypot(p.x - g.x, p.z - g.z);
      const los = maze.hasLineOfSight(g.x, g.z, p.x, p.z);
      if (d <= radius && los) ids.push(robot.id);
      else if (d <= BLAST_HEARING) robot.sensor.hearNoise(g.x, g.z);
    }
    for (const id of ids) this.deps.robots.destroy(id, 'grenade');
  }

  private emitAt(name: 'weapon:grenadeBounce' | 'weapon:explosion', x: number, y: number, z: number): void {
    const e = this.posEvent;
    e.x = x;
    e.y = y;
    e.z = z;
    this.deps.events.emit(name, e);
  }

  dispose(): void {
    this.view.dispose();
    for (const g of this.projectiles) g.mesh.removeFromParent();
  }
}
