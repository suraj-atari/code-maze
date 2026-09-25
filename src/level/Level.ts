import type { LevelConfig } from '../config/types';
import type { Maze } from '../maze/Maze';
import type { Random } from '../utils/Random';
import type { ExitZone } from './ExitZone';

/** Everything that exists for the lifetime of one level. */
export class Level {
  elapsed = 0;
  completed = false;
  /** The exit opens only with this wing's keycard (false when the wing has no keycard room). */
  keycardRequired = false;
  hasKeycard = false;

  get exitLocked(): boolean {
    return this.keycardRequired && !this.hasKeycard;
  }

  constructor(
    readonly config: LevelConfig,
    readonly maze: Maze,
    readonly exit: ExitZone,
    readonly rng: Random,
  ) {}

  dispose(): void {
    this.maze.dispose();
    this.exit.dispose();
  }
}
