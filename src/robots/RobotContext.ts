import type { AIConfig, RobotConfig } from '../config/types';
import type { MazeData } from '../maze/MazeData';
import type { Pathfinder } from '../maze/Pathfinder';
import type { PlayerPerception } from '../player/Player';
import type { Random } from '../utils/Random';
import type { RobotController } from './RobotController';
import type { RobotMemory } from './RobotMemory';
import type { RobotSensor } from './RobotSensor';

/** Level-scoped services shared by all robots. Re-bound by RobotManager on each level load. */
export class RobotWorld {
  maze!: MazeData;
  pathfinder!: Pathfinder;
  rng!: Random;
  player!: PlayerPerception;
}

/** Everything a behaviour state may read or drive. */
export interface RobotContext {
  readonly id: number;
  readonly controller: RobotController;
  readonly sensor: RobotSensor;
  readonly memory: RobotMemory;
  readonly world: RobotWorld;
  readonly config: RobotConfig;
  readonly ai: AIConfig;
}
