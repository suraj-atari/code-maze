import type { MazeData } from './MazeData';

/**
 * Breadth-first step distances from `from` to every walkable cell (-1 = unreachable).
 * Load-time helper; writes into `out` so callers can reuse the buffer.
 */
export function bfsDistances(maze: MazeData, from: number, out: Int32Array): Int32Array {
  out.fill(-1);
  const queue = new Int32Array(maze.cellCount);
  const w = maze.width;
  let head = 0;
  let tail = 0;
  out[from] = 0;
  queue[tail++] = from;
  while (head < tail) {
    const c = queue[head++]!;
    const d = out[c]! + 1;
    const n0 = c + 1;
    const n1 = c - 1;
    const n2 = c + w;
    const n3 = c - w;
    if (maze.isWalkable(n0) && out[n0] === -1) { out[n0] = d; queue[tail++] = n0; }
    if (maze.isWalkable(n1) && out[n1] === -1) { out[n1] = d; queue[tail++] = n1; }
    if (maze.isWalkable(n2) && out[n2] === -1) { out[n2] = d; queue[tail++] = n2; }
    if (maze.isWalkable(n3) && out[n3] === -1) { out[n3] = d; queue[tail++] = n3; }
  }
  return out;
}

/** Returns the walkable neighbour of `cell` (first found) or -1. */
export function firstOpenNeighbour(maze: MazeData, cell: number): number {
  const w = maze.width;
  for (const n of [cell + 1, cell - 1, cell + w, cell - w]) if (maze.isWalkable(n)) return n;
  return -1;
}
