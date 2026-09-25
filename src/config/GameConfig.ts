import { aiConfig } from './ai.config';
import { armoryConfig, weaponsConfig } from './armory.config';
import { audioConfig } from './audio.config';
import { difficulties } from './difficulty.config';
import { graphicsConfig } from './graphics.config';
import { lampConfig } from './lamp.config';
import { mazeConfig } from './maze.config';
import { playerConfig } from './player.config';
import { robotConfig } from './robot.config';
import type { DifficultyConfig, GameConfig, LevelConfig } from './types';

export const gameConfig: GameConfig = {
  player: playerConfig,
  lamp: lampConfig,
  robot: robotConfig,
  ai: aiConfig,
  maze: mazeConfig,
  audio: audioConfig,
  graphics: graphicsConfig,
  armory: armoryConfig,
  weapons: weaponsConfig,
  difficulties,
  defaultDifficulty: 'normal',
};

export function findDifficulty(config: GameConfig, id: string): DifficultyConfig {
  return config.difficulties.find((d) => d.id === id) ?? config.difficulties[0]!;
}

/**
 * Merges base configs with a difficulty and its per-level progression.
 * Called once per level load, never per frame.
 */
export function resolveLevelConfig(
  config: GameConfig,
  difficulty: DifficultyConfig,
  levelIndex: number,
  seed: number,
): LevelConfig {
  const p = difficulty.progression;
  const n = levelIndex;
  const speed = Math.min(p.maxRobotSpeed, difficulty.robotSpeed + n * p.robotSpeedStep);
  const r = config.robot;
  // A chasing robot never outruns a sprinting player: escaping (and hiding) must stay possible.
  const maxChase = config.player.sprintSpeed * config.ai.maxChaseSpeedFactor;

  return {
    levelIndex,
    difficulty,
    seed,
    mazeRooms: Math.min(p.maxMazeSize, difficulty.mazeSize + n * p.mazeSizeStep),
    robotCount: Math.min(p.maxRobots, difficulty.robotCount + Math.floor(n * p.robotCountStep)),
    darkness: Math.min(1, difficulty.darknessLevel + n * p.darknessStep),
    player: config.player,
    maze: config.maze,
    lamp: {
      ...config.lamp,
      batterySeconds: Math.max(p.minBattery, difficulty.lampBattery + n * p.batteryStep),
      range: difficulty.lampRange,
      rechargePerSecond: difficulty.lampRecharge,
    },
    robot: {
      ...r,
      patrolSpeed: r.patrolSpeed * speed,
      investigateSpeed: r.investigateSpeed * speed,
      searchSpeed: r.searchSpeed * speed,
      chaseSpeed: Math.min(maxChase, r.chaseSpeed * speed),
      returnSpeed: r.returnSpeed * speed,
    },
    ai: {
      ...config.ai,
      visionRange: difficulty.robotDetectionRange,
      visionFovDeg: difficulty.robotFovDeg,
      hearingMultiplier: difficulty.robotHearing,
      suspicionGain: config.ai.suspicionGain * difficulty.suspicionGain,
    },
  };
}
