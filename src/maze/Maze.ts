import type { MazeConfig } from '../config/types';
import type { PhysicsSystem } from '../physics/PhysicsSystem';
import type { Random } from '../utils/Random';
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
    readonly renderer: MazeRenderer,
    readonly physics: MazePhysics,
    readonly pathfinder: Pathfinder,
  ) {}

  static build(p: MazeBuildParams): Maze {
    const generator = createMazeGenerator(p.config.generator);
    const data = generator.generate(
      { rooms: p.rooms, cellSize: p.config.cellSize, braidFactor: p.config.braidFactor },
      p.rng,
    );
    return new Maze(
      data,
      new MazeRenderer(data, p.config, p.textures, p.shadows),
      new MazePhysics(p.physics, data, p.config),
      new Pathfinder(data),
    );
  }

  dispose(): void {
    this.renderer.dispose();
    this.physics.dispose();
  }
}
