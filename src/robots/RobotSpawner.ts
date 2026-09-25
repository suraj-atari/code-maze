import type { AIConfig } from '../config/types';
import { bfsDistances } from '../maze/MazeAnalysis';
import type { MazeData } from '../maze/MazeData';
import type { Pathfinder } from '../maze/Pathfinder';
import type { Random } from '../utils/Random';

export interface SpawnPlan {
  readonly cell: number;
  readonly heading: number;
  readonly route: number[];
}

/** Cells within this many steps of the player start are never used for spawns or routes. */
const SAFE_START_STEPS = 5;

/**
 * Chooses spawn cells far from the player start, spread out from each other, and gives each
 * robot a patrol "territory" route around its spawn. Load-time only.
 */
export function planRobotSpawns(
  maze: MazeData,
  pathfinder: Pathfinder,
  count: number,
  ai: AIConfig,
  rng: Random,
): SpawnPlan[] {
  const dist = bfsDistances(maze, maze.startCell, new Int32Array(maze.cellCount));
  let maxDist = 0;
  for (let i = 0; i < dist.length; i++) maxDist = Math.max(maxDist, dist[i]!);
  const minDist = Math.min(ai.minSpawnDistanceCells, Math.floor(maxDist * 0.5));

  const candidates: number[] = [];
  for (let i = 0; i < dist.length; i++) {
    if (dist[i]! >= minDist && i !== maze.exitCell) candidates.push(i);
  }
  rng.shuffle(candidates);

  const chosen: number[] = [];
  const spacing = 4;
  for (const c of candidates) {
    if (chosen.length >= count) break;
    const cx = maze.cellX(c);
    const cy = maze.cellY(c);
    const farEnough = chosen.every(
      (o) => Math.abs(maze.cellX(o) - cx) + Math.abs(maze.cellY(o) - cy) >= spacing,
    );
    if (farEnough) chosen.push(c);
  }
  // Fallback when the maze is too small for the requested spacing.
  for (const c of candidates) {
    if (chosen.length >= count) break;
    if (!chosen.includes(c)) chosen.push(c);
  }

  return chosen.map((cell) => {
    const route = [cell];
    for (let i = 1; i < ai.patrolWaypoints; i++) {
      let wp = cell;
      for (let attempt = 0; attempt < 6; attempt++) {
        wp = pathfinder.randomCellWithin(cell, ai.patrolRadiusCells, 4, rng);
        if (dist[wp]! > SAFE_START_STEPS) break;
      }
      route.push(wp);
    }
    return { cell, heading: rng.range(-Math.PI, Math.PI), route };
  });
}
