import type { RobotStateId } from '../../core/types';
import type { RobotContext } from '../RobotContext';
import type { State } from '../RobotStateMachine';
import { perceptionTransition } from './shared';

/** Head back to the patrol route, still alert to sightings and noises. */
export class ReturnState implements State<RobotContext, RobotStateId> {
  readonly id = 'return' as const;

  enter(ctx: RobotContext): void {
    const m = ctx.memory;
    if (m.routeLength === 0 || !ctx.controller.moveToCell(m.route[m.routeIndex]!, ctx.config.returnSpeed)) {
      ctx.controller.stop();
    }
  }

  update(ctx: RobotContext): RobotStateId | null {
    const next = perceptionTransition(ctx);
    if (next) return next;
    return ctx.controller.arrived ? 'patrol' : null;
  }

  exit(): void {}
}
