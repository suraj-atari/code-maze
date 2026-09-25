import { Group, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import type { LootKind } from '../config/types';
import type { MazeData } from '../maze/MazeData';
import type { PhysicsSystem, RigidBody } from '../physics/PhysicsSystem';
import type { WeaponModels } from '../weapons/WeaponModels';
import { DOOR_HEIGHT, DOOR_INSET, type ArmoryAssets } from './ArmoryAssets';
import type { ArmorySite } from './ArmoryPlanner';

const LOCKED_COLOR = 0xff2a1a;
const OPEN_COLOR = 0x35ff9a;

export type DoorState = 'closed' | 'opening' | 'open';

/**
 * One sealed room: a dead-end cell closed off by a steel door that slides sideways into
 * the wall when opened (Wolfenstein 3D style), with a cache inside holding weapons, a robot
 * nullifier or the exit keycard (see `loot`).
 * Local frame of `root`: origin on the door plane, +Z pointing out to the corridor, door slides to +X.
 */
export class Armory {
  readonly root = new Group();
  readonly doorX: number;
  readonly doorZ: number;
  readonly cacheX: number;
  readonly cacheZ: number;
  readonly loot: LootKind;
  state: DoorState = 'closed';
  looted = false;

  private readonly panel: Mesh;
  private readonly lootGroup = new Group();
  private readonly ring: Mesh;
  /** Glowing outline while the door can still be opened. */
  private readonly highlight: Mesh;
  private readonly strip: Mesh;
  private readonly lampMaterial = new MeshBasicMaterial({ color: LOCKED_COLOR, toneMapped: false });
  private readonly slideDistance: number;
  /** Unit axis from the room out to the corridor. */
  readonly normalX: number;
  readonly normalZ: number;
  private readonly halfWidth: number;
  private body: RigidBody | null;
  private openT = 0;

  constructor(
    site: ArmorySite,
    maze: MazeData,
    private readonly assets: ArmoryAssets,
    models: WeaponModels,
    private readonly physics: PhysicsSystem,
  ) {
    const s = maze.cellSize;
    const cx = maze.centerX(site.cell);
    const cz = maze.centerZ(site.cell);
    const dx = Math.sign(maze.centerX(site.entrance) - cx);
    const dz = Math.sign(maze.centerZ(site.entrance) - cz);
    const toDoor = s / 2 - DOOR_INSET;
    this.doorX = cx + dx * toDoor;
    this.doorZ = cz + dz * toDoor;
    this.cacheX = cx - dx * 0.3;
    this.cacheZ = cz - dz * 0.3;
    this.slideDistance = s - 0.1;
    this.normalX = dx;
    this.normalZ = dz;
    this.halfWidth = s / 2;

    this.loot = site.loot ?? 'weapons';
    this.root.name = `armory-${site.cell}-${this.loot}`;
    this.root.position.set(this.doorX, 0, this.doorZ);
    this.root.rotation.y = Math.atan2(dx, dz);

    const a = assets;
    const wallH = a.maze.wallHeight;
    const lintelY = DOOR_HEIGHT + (wallH - DOOR_HEIGHT) / 2;

    this.panel = new Mesh(a.door, a.doorMaterial);
    this.panel.position.y = DOOR_HEIGHT / 2;
    this.panel.castShadow = true;
    const jambL = new Mesh(a.jamb, a.jambMaterial);
    jambL.position.set(-(s / 2 - 0.04), DOOR_HEIGHT / 2, 0);
    const jambR = new Mesh(a.jamb, a.jambMaterial);
    jambR.position.set(s / 2 - 0.04, DOOR_HEIGHT / 2, 0);
    const lintel = new Mesh(a.lintel, a.frameMaterial);
    lintel.position.y = lintelY;
    const sign = new Mesh(a.sign, a.signMaterials[this.loot]);
    sign.position.set(0, lintelY, 0.235);
    const lampL = new Mesh(a.lamp, this.lampMaterial);
    lampL.position.set(-0.85, lintelY, 0.24);
    const lampR = new Mesh(a.lamp, this.lampMaterial);
    lampR.position.set(0.85, lintelY, 0.24);

    // Supply cache inside the room.
    const cache = new Group();
    cache.position.z = -toDoor - 0.3;
    const crate = new Mesh(a.crate, a.crateMaterial);
    crate.position.y = 0.25;
    this.strip = new Mesh(a.strip, a.stripOn);
    this.strip.position.y = 0.36;
    this.ring = new Mesh(a.ring, a.ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.buildLoot(models);
    cache.add(crate, this.strip, this.ring, this.lootGroup);

    this.highlight = new Mesh(a.highlight, a.highlightMaterial);
    this.highlight.renderOrder = 2;

    this.root.add(this.panel, jambL, jambR, lintel, sign, lampL, lampR, cache, this.highlight);

    // Door collider (axis aligned in world space, spans the corridor).
    const hy = wallH / 2;
    const thin = 0.1;
    this.body = physics.createFixedBody(this.doorX, 0, this.doorZ);
    physics.addBox(this.body, dx !== 0 ? thin : s / 2, hy, dx !== 0 ? s / 2 : thin, 0, hy, 0);
  }

  get closed(): boolean {
    return this.state === 'closed';
  }

  /** Loot can be taken once the door is mostly open. */
  get lootable(): boolean {
    return !this.looted && this.openT > 0.6;
  }

  /** True if the (still solid) door slab contains the point — used for thrown grenades. */
  blocks(x: number, z: number): boolean {
    if (!this.body) return false;
    const ox = x - this.doorX;
    const oz = z - this.doorZ;
    const across = ox * this.normalX + oz * this.normalZ;
    const along = this.normalX !== 0 ? oz : ox;
    return Math.abs(across) < 0.12 && Math.abs(along) < this.halfWidth;
  }

  /** Starts sliding the door open. Returns false if it was already open(ing). */
  open(): boolean {
    if (this.state !== 'closed') return false;
    this.state = 'opening';
    this.highlight.visible = false;
    this.lampMaterial.color.setHex(OPEN_COLOR);
    return true;
  }

  markLooted(): void {
    this.looted = true;
    this.lootGroup.visible = false;
    this.ring.visible = false;
    this.strip.material = this.assets.stripOff;
  }

  update(dt: number, time: number, openSeconds: number): void {
    if (this.state === 'opening') {
      this.openT = Math.min(1, this.openT + dt / openSeconds);
      // Near-steady slide like a Wolfenstein door, settling slightly at the end.
      const t = this.openT;
      this.panel.position.x = (0.4 * t + 0.6 * t * (2 - t)) * this.slideDistance;
      if (this.openT > 0.5) this.removeCollider();
      if (this.openT >= 1) this.state = 'open';
    }
    if (!this.looted) {
      this.lootGroup.rotation.y = time * 1.2;
      this.lootGroup.position.y = Math.sin(time * 2) * 0.04;
      this.assets.ringMaterial.opacity = 0.35 + 0.2 * Math.sin(time * 3);
    }
  }

  private buildLoot(models: WeaponModels): void {
    const a = this.assets;
    if (this.loot === 'nullifier') {
      const base = this.place(new Mesh(a.deviceBase, a.frameMaterial), 0, 0.56, 0);
      const core = this.place(new Mesh(a.deviceCore, a.nullifierGlow), 0, 0.7, 0);
      const ring = this.place(new Mesh(a.deviceRing, a.nullifierGlow), 0, 0.7, 0);
      ring.rotation.x = Math.PI / 2;
      const ring2 = this.place(new Mesh(a.deviceRing, a.nullifierGlow), 0, 0.7, 0);
      ring2.rotation.y = Math.PI / 2;
      this.lootGroup.add(base, core, ring, ring2);
    } else if (this.loot === 'keycard') {
      const card = this.place(new Mesh(a.keycard, a.keycardMaterial), 0, 0.72, 0);
      const band = this.place(new Mesh(a.keycardBand, a.keycardStripe), 0, 0.76, 0);
      card.rotation.x = band.rotation.x = -0.2;
      this.lootGroup.add(card, band);
    } else {
      const hammer = this.place(models.hammer(), -0.16, 0.6, 0);
      hammer.scale.setScalar(0.75);
      hammer.rotation.z = 0.6;
      const grenadeA = this.place(models.grenade(), 0.18, 0.78, 0.05);
      const grenadeB = this.place(models.grenade(), 0.3, 0.74, -0.08);
      this.lootGroup.add(hammer, grenadeA, grenadeB);
    }
  }

  private place(o: Object3D, x: number, y: number, z: number): Object3D {
    o.position.set(x, y, z);
    return o;
  }

  private removeCollider(): void {
    if (this.body) this.physics.removeBody(this.body);
    this.body = null;
  }

  dispose(): void {
    this.removeCollider();
    this.root.removeFromParent();
    this.lampMaterial.dispose();
  }
}
