export const CellType = {
  Floor: 0,
  Wall: 1,
} as const;

/**
 * Pure maze data: a grid of wall/floor cells plus start and exit. No rendering or physics.
 * Cell (x, y) covers world X ∈ [x·size, (x+1)·size] and world Z ∈ [y·size, (y+1)·size].
 */
export class MazeData {
  readonly cells: Uint8Array;
  startCell = 0;
  exitCell = 0;
  /**
   * Wall cells the player can walk into (open lab chambers). They stay walls for the AI, so
   * robots neither see nor path into them: a place to hide.
   */
  readonly hideouts = new Set<number>();

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
  ) {
    this.cells = new Uint8Array(width * height).fill(CellType.Wall);
  }

  get cellCount(): number {
    return this.cells.length;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  cellX(index: number): number {
    return index % this.width;
  }

  cellY(index: number): number {
    return (index / this.width) | 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Out-of-bounds counts as wall. */
  isWall(x: number, y: number): boolean {
    return !this.inBounds(x, y) || this.cells[y * this.width + x] === CellType.Wall;
  }

  /** Solid for the player's body and camera: a wall that is not a hideout. */
  isBlocked(x: number, y: number): boolean {
    return this.isWall(x, y) && !(this.inBounds(x, y) && this.hideouts.has(y * this.width + x));
  }

  isWalkable(index: number): boolean {
    return this.cells[index] === CellType.Floor;
  }

  setFloor(x: number, y: number): void {
    this.cells[y * this.width + x] = CellType.Floor;
  }

  /** World-space X of the centre of a cell index. */
  centerX(index: number): number {
    return (this.cellX(index) + 0.5) * this.cellSize;
  }

  /** World-space Z of the centre of a cell index. */
  centerZ(index: number): number {
    return (this.cellY(index) + 0.5) * this.cellSize;
  }

  /** Cell index at a world position, or -1 outside the grid. */
  cellAt(worldX: number, worldZ: number): number {
    const x = Math.floor(worldX / this.cellSize);
    const y = Math.floor(worldZ / this.cellSize);
    return this.inBounds(x, y) ? y * this.width + x : -1;
  }

  /** Number of walkable 4-neighbours of a cell. */
  openNeighbours(index: number): number {
    const x = this.cellX(index);
    const y = this.cellY(index);
    return (
      (this.isWall(x + 1, y) ? 0 : 1) +
      (this.isWall(x - 1, y) ? 0 : 1) +
      (this.isWall(x, y + 1) ? 0 : 1) +
      (this.isWall(x, y - 1) ? 0 : 1)
    );
  }

  /**
   * Grid line-of-sight on the XZ plane by sampling the segment at quarter-cell steps.
   * Allocation-free; used by AI perception so it stays independent from the physics engine.
   */
  hasLineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(dist / (this.cellSize * 0.25));
    const inv = 1 / this.cellSize;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.floor((ax + dx * t) * inv);
      const cz = Math.floor((az + dz * t) * inv);
      if (this.isWall(cx, cz)) return false;
    }
    return true;
  }
}
