import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  TorusGeometry,
  type Scene,
} from 'three';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { Chamber } from '../maze/LabChambers';
import type { MazeData } from '../maze/MazeData';
import { Random } from '../utils/Random';

/**
 * Where the cell lies, from the centre of the room's front cell toward the door: in the open
 * front half, far enough from the door that it shuts while the player picks it up.
 */
const FRONT_OFFSET = -0.2;
const PICKUP_RADIUS = 0.75;

interface Cache {
  readonly mesh: Group;
  readonly x: number;
  readonly z: number;
  taken: boolean;
}

/**
 * EMP cells lying inside some of the lab rooms (the hideouts): walk over one for +1 nullifier
 * charge. A reason to duck into rooms besides hiding. Shared geometry/materials, no lights.
 */
export class EmpCaches {
  private readonly root = new Group();
  private readonly caches: Cache[] = [];
  private readonly body = new CylinderGeometry(0.09, 0.09, 0.28, 12);
  private readonly ring = new TorusGeometry(0.13, 0.018, 6, 20).rotateX(Math.PI / 2);
  private readonly bodyMaterial = new MeshStandardMaterial({ color: 0x2a1f3d, metalness: 0.6, roughness: 0.35 });
  private readonly glowMaterial = new MeshBasicMaterial({ color: 0xa66bff, toneMapped: false });

  constructor(
    private readonly scene: Scene,
    private readonly events: EventBus<GameEvents>,
  ) {
    this.root.name = 'emp-caches';
  }

  /** @param share fraction of rooms that get a cell; deterministic per seed */
  spawn(maze: MazeData, chambers: readonly Chamber[], share: number, seed: number): void {
    this.clear();
    const rng = new Random(seed ^ 0x5e3d1);
    for (const c of chambers) {
      if (!rng.chance(share)) continue;
      const x = maze.centerX(c.index) + c.frontDx * FRONT_OFFSET;
      const z = maze.centerZ(c.index) + c.frontDy * FRONT_OFFSET;
      const g = new Group();
      const body = new Mesh(this.body, this.bodyMaterial);
      body.position.y = 0.2;
      const top = new Mesh(this.ring, this.glowMaterial);
      top.position.y = 0.3;
      const bottom = new Mesh(this.ring, this.glowMaterial);
      bottom.position.y = 0.1;
      g.add(body, top, bottom);
      g.position.set(x, 0, z);
      this.root.add(g);
      this.caches.push({ mesh: g, x, z, taken: false });
    }
    this.scene.add(this.root);
  }

  update(time: number, playerX: number, playerZ: number): void {
    for (const c of this.caches) {
      if (c.taken) continue;
      c.mesh.rotation.y = time * 1.6;
      c.mesh.position.y = 0.06 + Math.sin(time * 3 + c.x) * 0.04;
      const dx = playerX - c.x;
      const dz = playerZ - c.z;
      if (dx * dx + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
      c.taken = true;
      c.mesh.visible = false;
      this.events.emit('pickup:nullifier', { charges: 1 });
    }
  }

  clear(): void {
    this.root.removeFromParent();
    this.root.clear();
    this.caches.length = 0;
  }

  dispose(): void {
    this.clear();
    this.body.dispose();
    this.ring.dispose();
    this.bodyMaterial.dispose();
    this.glowMaterial.dispose();
  }
}
