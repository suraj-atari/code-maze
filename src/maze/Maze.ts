import type { MazeConfig } from '../config/types';
import type { PhysicsSystem } from '../physics/PhysicsSystem';
import type { Random } from '../utils/Random';
import { pickChambers, type Chamber } from './LabChambers';
import type { MazeData } from './MazeData';
import { createMazeGenerator, registerMazeGenerator } from './MazeGenerator';
import { MazePhysics } from './MazePhysics';
import { MazeRenderer, type MazeTextures } from './MazeRenderer';
import { Pathfinder } from './Pathfinder';
import { RecursiveBacktrackerGenerator } from './RecursiveBacktrackerGenerator';

registerMazeGenerator('recursive-backtracker', () => new RecursiveBacktrackerGenerator());

export interface MazeBuildParams {
  readonly rooms: number;
  readonly config: MazeConfig;
  readonly textures: MazeTextures;
  readonly shadows: boolean;
  /** See-through glass windows in the walls (off on phones: a second, transparent pass). */
  readonly glassWindows: boolean;
  readonly physics: PhysicsSystem;
  readonly rng: Random;
}

/**
 * Facade tying together the independent representations of one maze:
 * MazeData (logic) → MazeRenderer (visuals) + MazePhysics (colliders) + Pathfinder (AI).
 */
export class Maze {
  private constructor(
    readonly data: MazeData,
    /** Lab rooms (hideouts) with their door directions. */
    readonly chambers: readonly Chamber[],
    readonly renderer: MazeRenderer,
    readonly physics: MazePhysics,
    readonly pathfinder: Pathfinder,
  ) {}

  /**
   * Generates the maze layout only (no visuals, physics or chambers). Same rooms/config/seed →
   * same layout as `build`, so the menu can preview the map the next run will use.
   */
  static generate(rooms: number, config: MazeConfig, rng: Random): MazeData {
    const generator = createMazeGenerator(config.generator);
    return generator.generate({ rooms, cellSize: config.cellSize, braidFactor: config.braidFactor }, rng);
  }

  static build(p: MazeBuildParams): Maze {
    const data = Maze.generate(p.rooms, p.config, p.rng);
    const chambers = pickChambers(data);
    for (const c of chambers) {
      data.hideouts.add(c.index);
      data.hideouts.add(c.backIndex);
    }
    return new Maze(
      data,
      chambers,
      new MazeRenderer(data, chambers, p.config, p.textures, p.shadows, p.glassWindows),
      new MazePhysics(p.physics, data, chambers, p.config),
      new Pathfinder(data),
    );
  }

  dispose(): void {
    this.renderer.dispose();
    this.physics.dispose();
  }
}
