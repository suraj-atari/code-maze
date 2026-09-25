import type { MazeConfig } from '../config/types';
import type { PhysicsSystem, RigidBody } from '../physics/PhysicsSystem';
import type { MazeData } from './MazeData';

/**
 * Physics representation of MazeData: one fixed body holding a floor slab plus box colliders
 * for horizontal runs of wall cells (merging runs cuts collider count dramatically).
 */
export class MazePhysics {
  private readonly body: RigidBody;
  colliderCount = 0;

  constructor(
    private readonly physics: PhysicsSystem,
    maze: MazeData,
    config: MazeConfig,
  ) {
    this.body = physics.createFixedBody();
    const s = maze.cellSize;
    const w = maze.width * s;
    const d = maze.height * s;
    const hy = config.wallHeight / 2;

    physics.addBox(this.body, w / 2, 0.5, d / 2, w / 2, -0.5, d / 2);
    this.colliderCount++;

    for (let y = 0; y < maze.height; y++) {
      let runStart = -1;
      for (let x = 0; x <= maze.width; x++) {
        const wall = x < maze.width && maze.isWall(x, y);
        if (wall && runStart < 0) runStart = x;
        else if (!wall && runStart >= 0) {
          const len = x - runStart;
          physics.addBox(this.body, (len * s) / 2, hy, s / 2, (runStart + len / 2) * s, hy, (y + 0.5) * s);
          this.colliderCount++;
          runStart = -1;
        }
      }
    }
  }

  dispose(): void {
    this.physics.removeBody(this.body);
  }
}
