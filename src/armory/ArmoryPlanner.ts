import type { ArmoryConfig, LootKind } from '../config/types';
import { bfsDistances, firstOpenNeighbour } from '../maze/MazeAnalysis';
import type { MazeData } from '../maze/MazeData';
import type { Random } from '../utils/Random';

export interface ArmorySite {
  /** Dead-end cell that becomes the sealed room. */
  readonly cell: number;
  /** The only open neighbour: the corridor the door faces. */
  readonly entrance: number;
  /** Defaults to 'weapons'. */
  readonly loot?: LootKind;
}

/**
 * Picks dead ends (exactly one open neighbour) reachable from the start, away from the start
 * and exit, and spread out from each other, so most corridor branches end in a few rooms.
 * The room farthest from the start holds the exit keycard; a share of the rest hold robot
 * nullifiers, the others weapons. Load-time only.
 */
export function planArmories(maze: MazeData, config: ArmoryConfig, rng: Random): ArmorySite[] {
  const dist = bfsDistances(maze, maze.startCell, new Int32Array(maze.cellCount));
  const candidates: number[] = [];
  for (let i = 0; i < maze.cellCount; i++) {
    if (i === maze.startCell || i === maze.exitCell) continue;
    if (dist[i]! < config.minStartDistanceCells || maze.openNeighbours(i) !== 1) continue;
    candidates.push(i);
  }
  rng.shuffle(candidates);

  const target = Math.min(
    config.maxRooms,
    Math.max(config.perLevel, Math.round(candidates.length * config.roomsPerDeadEnd)),
  );
  const cells: { cell: number; entrance: number }[] = [];
  for (const cell of candidates) {
    if (cells.length >= target) break;
    const x = maze.cellX(cell);
    const y = maze.cellY(cell);
    const farEnough = cells.every(
      (s) => Math.abs(maze.cellX(s.cell) - x) + Math.abs(maze.cellY(s.cell) - y) >= config.spacingCells,
    );
    const entrance = firstOpenNeighbour(maze, cell);
    // Never seal the corridor leading to the exit.
    if (farEnough && entrance >= 0 && entrance !== maze.exitCell) cells.push({ cell, entrance });
  }
  if (cells.length === 0) return [];

  // Keycard: the room deepest into the maze, so the puzzle is "explore, then come back".
  let keyIdx = 0;
  for (let i = 1; i < cells.length; i++) if (dist[cells[i]!.cell]! > dist[cells[keyIdx]!.cell]!) keyIdx = i;

  const rest = cells.map((_, i) => i).filter((i) => i !== keyIdx);
  const nullifiers = Math.min(rest.length, Math.max(1, Math.round(rest.length * config.nullifierShare)));
  rng.shuffle(rest);
  const kinds = new Map<number, LootKind>([[keyIdx, 'keycard']]);
  rest.forEach((idx, n) => kinds.set(idx, n < nullifiers ? 'nullifier' : 'weapons'));

  return cells.map((c, i) => ({ ...c, loot: kinds.get(i)! }));
}
