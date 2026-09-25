import type { Random } from '../utils/Random';
import type { MazeData } from './MazeData';

/**
 * Allocation-free BFS on the maze grid (uniform cost, 4-neighbourhood).
 * Uses a visit "stamp" per search instead of clearing arrays, so each query is O(visited).
 * One instance is shared by all robots (JS is single-threaded).
 */
export class Pathfinder {
  private readonly cameFrom: Int32Array;
  private readonly depth: Int32Array;
  private readonly queue: Int32Array;
  private readonly candidates: Int32Array;
  private readonly visited: Uint32Array;
  private stamp = 0;

  constructor(private readonly maze: MazeData) {
    const n = maze.cellCount;
    this.cameFrom = new Int32Array(n);
    this.depth = new Int32Array(n);
    this.queue = new Int32Array(n);
    this.candidates = new Int32Array(n);
    this.visited = new Uint32Array(n);
  }

  /**
   * Writes the path (excluding `from`, including `to`) into `out` and returns its length,
   * 0 if from === to, or -1 if unreachable.
   */
  findPath(from: number, to: number, out: Int32Array): number {
    if (from === to) return 0;
    if (!this.maze.isWalkable(to) || !this.maze.isWalkable(from)) return -1;
    const stamp = this.nextStamp();
    const { cameFrom, queue, visited, maze } = this;
    const w = maze.width;
    let head = 0;
    let tail = 0;
    visited[from] = stamp;
    cameFrom[from] = -1;
    queue[tail++] = from;

    while (head < tail) {
      const c = queue[head++]!;
      if (c === to) break;
      for (let k = 0; k < 4; k++) {
        const n = k === 0 ? c + 1 : k === 1 ? c - 1 : k === 2 ? c + w : c - w;
        if (visited[n] === stamp || !maze.isWalkable(n)) continue;
        visited[n] = stamp;
        cameFrom[n] = c;
        queue[tail++] = n;
      }
    }
    if (visited[to] !== stamp) return -1;

    let len = 0;
    for (let c = to; c !== from; c = cameFrom[c]!) len++;
    let i = len - 1;
    for (let c = to; c !== from; c = cameFrom[c]!) out[i--] = c;
    return len;
  }

  /** A random walkable cell between `minSteps` and `maxSteps` BFS steps from `from` (or `from`). */
  randomCellWithin(from: number, maxSteps: number, minSteps: number, rng: Random): number {
    const stamp = this.nextStamp();
    const { depth, queue, visited, candidates, maze } = this;
    const w = maze.width;
    let head = 0;
    let tail = 0;
    let count = 0;
    visited[from] = stamp;
    depth[from] = 0;
    queue[tail++] = from;

    while (head < tail) {
      const c = queue[head++]!;
      const d = depth[c]!;
      if (d >= minSteps) candidates[count++] = c;
      if (d >= maxSteps) continue;
      for (let k = 0; k < 4; k++) {
        const n = k === 0 ? c + 1 : k === 1 ? c - 1 : k === 2 ? c + w : c - w;
        if (visited[n] === stamp || !maze.isWalkable(n)) continue;
        visited[n] = stamp;
        depth[n] = d + 1;
        queue[tail++] = n;
      }
    }
    return count > 0 ? candidates[rng.int(count)]! : from;
  }

  private nextStamp(): number {
    this.stamp++;
    if (this.stamp === 0xffffffff) {
      this.visited.fill(0);
      this.stamp = 1;
    }
    return this.stamp;
  }
}
