import type { MazeConfig } from '../config/types';
import type { PhysicsSystem, RigidBody } from '../physics/PhysicsSystem';
import { CHAMBER_OBSTACLES, chamberCenter, DOOR_WIDTH, PROP_SHIFT_CELLS, type Chamber } from './LabChambers';
import type { MazeData } from './MazeData';

/** Half thickness of a chamber's walls. */
const PANEL_HALF = 0.06;

/**
 * Physics representation of MazeData: one fixed body holding a floor slab plus box colliders
 * for horizontal runs of wall cells (merging runs cuts collider count dramatically).
 * Lab rooms (hideouts) get no block: thin walls on the sides that face a corridor, a front wall
 * with a doorway (the sliding door is visual only: it opens as the player comes close) and
 * colliders for their big props.
 */
export class MazePhysics {
  private readonly body: RigidBody;
  colliderCount = 0;

  constructor(
    private readonly physics: PhysicsSystem,
    maze: MazeData,
    chambers: readonly Chamber[],
    config: MazeConfig,
  ) {
    this.body = physics.createFixedBody();
    const s = maze.cellSize;
    const w = maze.width * s;
    const d = maze.height * s;
    const hy = config.wallHeight / 2;

    physics.addBox(this.body, w / 2, 0.5, d / 2, w / 2, -0.5, d / 2);
    this.colliderCount++;

    for (let y = 0; y < maze.height; y++) {
      let runStart = -1;
      for (let x = 0; x <= maze.width; x++) {
        const wall = x < maze.width && maze.isBlocked(x, y);
        if (wall && runStart < 0) runStart = x;
        else if (!wall && runStart >= 0) {
          const len = x - runStart;
          physics.addBox(this.body, (len * s) / 2, hy, s / 2, (runStart + len / 2) * s, hy, (y + 0.5) * s);
          this.colliderCount++;
          runStart = -1;
        }
      }
    }

    for (const c of chambers) this.addChamber(maze, c, s, hy);
  }

  private addChamber(maze: MazeData, c: Chamber, s: number, hy: number): void {
    for (const cell of [c.index, c.backIndex]) this.addChamberCell(maze, c, cell, s, hy);
    // Props: room space is rotated by the yaw (a multiple of 90°), so extents swap on X/Z.
    const at = chamberCenter(maze, c);
    const sin = Math.round(Math.sin(c.yaw));
    const cos = Math.round(Math.cos(c.yaw));
    const swap = sin !== 0;
    for (const o of CHAMBER_OBSTACLES[c.variant] ?? []) {
      const lz = o.z + PROP_SHIFT_CELLS * s;
      const wx = at.x + o.x * cos + lz * sin;
      const wz = at.z - o.x * sin + lz * cos;
      const half = o.height / 2;
      this.physics.addBox(this.body, swap ? o.hz : o.hx, half, swap ? o.hx : o.hz, wx, half, wz);
      this.colliderCount++;
    }
  }

  /** Thin walls around one room cell: toward open floor, plus the door wall on the front cell. */
  private addChamberCell(maze: MazeData, c: Chamber, cell: number, s: number, hy: number): void {
    const cx = maze.centerX(cell);
    const cz = maze.centerZ(cell);
    const gx = maze.cellX(cell);
    const gy = maze.cellY(cell);
    const edge = s / 2 - PANEL_HALF;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const hx = dx !== 0 ? PANEL_HALF : s / 2;
      const hz = dx !== 0 ? s / 2 : PANEL_HALF;
      const wx = cx + dx * edge;
      const wz = cz + dy * edge;
      const neighbour = maze.index(gx + dx, gy + dy);
      // The two room cells are open to each other.
      if (neighbour === c.index || neighbour === c.backIndex) continue;
      if (cell === c.index && dx === c.frontDx && dy === c.frontDy) {
        // Front wall: two panels either side of the doorway.
        const half = (s - DOOR_WIDTH) / 4;
        const off = DOOR_WIDTH / 2 + half;
        for (const sign of [-1, 1]) {
          this.physics.addBox(
            this.body,
            dx !== 0 ? PANEL_HALF : half,
            hy,
            dx !== 0 ? half : PANEL_HALF,
            wx + (dx !== 0 ? 0 : sign * off),
            hy,
            wz + (dx !== 0 ? sign * off : 0),
          );
          this.colliderCount++;
        }
        continue;
      }
      // Wall neighbours already have a collider; a panel is only needed toward open floor.
      if (maze.isBlocked(gx + dx, gy + dy)) continue;
      this.physics.addBox(this.body, hx, hy, hz, wx, hy, wz);
      this.colliderCount++;
    }
  }

  dispose(): void {
    this.physics.removeBody(this.body);
  }
}
