import { resolveLevelConfig } from '../config/GameConfig';
import type { DifficultyConfig, GameConfig, LevelConfig } from '../config/types';
import { cellOf, TUTORIAL_GENERATOR } from './TutorialMap';

/** Forgiving settings: bright-ish maze, slow sentinels with short sight and poor hearing. */
const TRAINING: DifficultyConfig = {
  id: 'training',
  label: 'Training',
  description: 'Guided tutorial.',
  mazeSize: 6,
  robotCount: 0,
  robotSpeed: 0.8,
  robotDetectionRange: 11,
  robotFovDeg: 90,
  robotHearing: 0.8,
  suspicionGain: 0.7,
  lampBattery: 300,
  lampRange: 18,
  lampRecharge: 5,
  darknessLevel: 0.3,
  progression: {
    mazeSizeStep: 0, maxMazeSize: 6, robotCountStep: 0, maxRobots: 0,
    robotSpeedStep: 0, maxRobotSpeed: 0.8, batteryStep: 0, minBattery: 300, darknessStep: 0,
  },
};

/** The fixed training course: no random robots (the script spawns them), one known armory. */
export function tutorialLevelConfig(config: GameConfig): LevelConfig {
  const base = resolveLevelConfig(config, TRAINING, 0, 1);
  return {
    ...base,
    robotCount: 0,
    maze: { ...base.maze, generator: TUTORIAL_GENERATOR },
    tutorial: true,
    fixedArmories: [{ cell: cellOf('armory'), entrance: cellOf('armoryEntrance') }],
  };
}
