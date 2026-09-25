import type { RobotStateId } from '../../core/types';
import type { RobotContext } from '../RobotContext';
import { Phase } from '../RobotMemory';
import type { State } from '../RobotStateMachine';
import { beginLookAround, lookAround, perceptionTransition } from './shared';

/** Sweep random cells around the last known position for `searchSeconds`, then return. */
export class SearchState implements State<RobotContext, RobotStateId> {
  readonly id = 'search' as const;

  enter(ctx: RobotContext): void {
    const m = ctx.memory;
    m.timer = ctx.ai.searchSeconds;
    m.phase = Phase.Moving;
    if (!ctx.controller.moveToPoint(m.targetX, m.targetZ, ctx.config.searchSpeed)) ctx.controller.stop();
  }

  update(ctx: RobotContext, dt: number): RobotStateId | null {
    const next = perceptionTransition(ctx);
    if (next) return next;

    const m = ctx.memory;
    m.timer -= dt;
    if (m.timer <= 0) return 'return';

    if (m.phase === Phase.Moving) {
      if (ctx.controller.arrived) {
        m.phase = Phase.Looking;
        m.subTimer = ctx.world.rng.range(0.9, 1.8);
        beginLookAround(ctx);
      }
      return null;
    }

    lookAround(ctx, dt);
    m.subTimer -= dt;
    if (m.subTimer <= 0) {
      const { maze, pathfinder, rng } = ctx.world;
      const origin = maze.cellAt(m.targetX, m.targetZ);
      const from = origin >= 0 && maze.isWalkable(origin) ? origin : ctx.controller.currentCell;
      const cell = pathfinder.randomCellWithin(from, ctx.ai.searchRadiusCells, 1, rng);
      m.phase = Phase.Moving;
      ctx.controller.moveToCell(cell, ctx.config.searchSpeed);
    }
    return null;
  }

  exit(): void {}
}
