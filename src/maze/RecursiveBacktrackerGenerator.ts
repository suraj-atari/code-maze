import type { Random } from '../utils/Random';
import { bfsDistances } from './MazeAnalysis';
import { MazeData } from './MazeData';
import type { MazeGenerationOptions, MazeGenerator } from './MazeGenerator';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Classic depth-first "recursive backtracker" (iterative), producing long winding corridors,
 * followed by optional braiding that removes some dead ends so the player has escape loops.
 */
export class RecursiveBacktrackerGenerator implements MazeGenerator {
  readonly id = 'recursive-backtracker';

  generate(options: MazeGenerationOptions, rng: Random): MazeData {
    const rooms = Math.max(2, Math.floor(options.rooms));
    const size = rooms * 2 + 1;
    const maze = new MazeData(size, size, options.cellSize);

    this.carve(maze, rooms, rng);
    this.braid(maze, options.braidFactor, rng);

    maze.startCell = maze.index(1, 1);
    maze.exitCell = this.farthestCell(maze, maze.startCell);
    return maze;
  }

  private carve(maze: MazeData, rooms: number, rng: Random): void {
    const visited = new Uint8Array(rooms * rooms);
    const stack = new Int32Array(rooms * rooms);
    const order = [0, 1, 2, 3];
    let top = 0;
    stack[top++] = 0;
    visited[0] = 1;
    maze.setFloor(1, 1);

    while (top > 0) {
      const room = stack[top - 1]!;
      const rx = room % rooms;
      const ry = (room / rooms) | 0;
      rng.shuffle(order);
      let advanced = false;
      for (const o of order) {
        const [dx, dy] = DIRS[o]!;
        const nx = rx + dx;
        const ny = ry + dy;
        if (nx < 0 || ny < 0 || nx >= rooms || ny >= rooms) continue;
        const next = ny * rooms + nx;
        if (visited[next]) continue;
        visited[next] = 1;
        // Room (rx, ry) lives at grid (2rx+1, 2ry+1); open the wall between the two rooms.
        maze.setFloor(2 * rx + 1 + dx, 2 * ry + 1 + dy);
        maze.setFloor(2 * nx + 1, 2 * ny + 1);
        stack[top++] = next;
        advanced = true;
        break;
      }
      if (!advanced) top--;
    }
  }

  private braid(maze: MazeData, factor: number, rng: Random): void {
    if (factor <= 0) return;
    for (let y = 1; y < maze.height - 1; y += 2) {
      for (let x = 1; x < maze.width - 1; x += 2) {
        const i = maze.index(x, y);
        if (maze.openNeighbours(i) !== 1 || !rng.chance(factor)) continue;
        // Knock through a wall that leads to another room (not the border).
        const start = rng.int(4);
        for (let k = 0; k < 4; k++) {
          const [dx, dy] = DIRS[(start + k) % 4]!;
          const wx = x + dx;
          const wy = y + dy;
          const rx = x + dx * 2;
          const ry = y + dy * 2;
          if (rx <= 0 || ry <= 0 || rx >= maze.width - 1 || ry >= maze.height - 1) continue;
          if (!maze.isWall(wx, wy)) continue;
          maze.setFloor(wx, wy);
          break;
        }
      }
    }
  }

  private farthestCell(maze: MazeData, from: number): number {
    const dist = bfsDistances(maze, from, new Int32Array(maze.cellCount));
    let best = from;
    let bestD = -1;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i]! > bestD) {
        bestD = dist[i]!;
        best = i;
      }
    }
    return best;
  }
}
