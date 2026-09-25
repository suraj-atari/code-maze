import { MazeData } from '../maze/MazeData';
import { registerMazeGenerator, type MazeGenerationOptions, type MazeGenerator } from '../maze/MazeGenerator';

export const TUTORIAL_GENERATOR = 'tutorial';

const WIDTH = 20;
const HEIGHT = 15;

/**
 * Hand-built training course (grid x → world X, y → world Z). Top view:
 *
 *   start room ─ sprint corridor ──┐
 *                                  │ sneak corridor
 *         patrol corridor ═════════╪═════════   (sentinel #1 walks back and forth)
 *                                  │
 *                                  ├──── [ARMORY]
 *                                  │
 *   exit ─ grenade corridor ─ hammer room        (sentinels #2 and #3)
 */
const CARVE: ReadonlyArray<readonly [x0: number, y0: number, x1: number, y1: number]> = [
  [1, 1, 3, 3], // start room
  [4, 2, 14, 2], // sprint corridor
  [14, 3, 14, 5], // sneak corridor
  [10, 6, 18, 6], // patrol corridor
  [14, 7, 14, 11], // armory junction corridor
  [15, 9, 18, 9], // armory branch; (18, 9) is the sealed room
  [9, 12, 15, 13], // hammer room
  [1, 13, 8, 13], // grenade corridor; (1, 13) is the exit
];

/** Named grid positions the tutorial script refers to. */
export const P = {
  start: [2, 2],
  lookBeacon: [6, 2],
  sprintEnd: [13, 2],
  sneakEnd: [14, 4],
  junction: [14, 5],
  crossed: [14, 8],
  armory: [18, 9],
  armoryEntrance: [17, 9],
  hammerRoomDoor: [14, 11],
  patrolWest: [10, 6],
  patrolEast: [18, 6],
  hammerBot: [9, 12],
  hammerBotTurn: [9, 13],
  grenadeCorridor: [8, 13],
  grenadeBot: [3, 13],
  grenadeBotTurn: [4, 13],
  exit: [1, 13],
} as const satisfies Record<string, readonly [number, number]>;

export type PointName = keyof typeof P;

export function cellOf(name: PointName): number {
  const [x, y] = P[name];
  return y * WIDTH + x;
}

class TutorialGenerator implements MazeGenerator {
  readonly id = TUTORIAL_GENERATOR;

  generate(options: MazeGenerationOptions): MazeData {
    const maze = new MazeData(WIDTH, HEIGHT, options.cellSize);
    for (const [x0, y0, x1, y1] of CARVE) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) maze.setFloor(x, y);
    }
    maze.startCell = cellOf('start');
    maze.exitCell = cellOf('exit');
    return maze;
  }
}

registerMazeGenerator(TUTORIAL_GENERATOR, () => new TutorialGenerator());
