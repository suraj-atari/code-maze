import type { RobotStateId } from '../../core/types';
import type { RobotContext } from '../RobotContext';
import { Phase } from '../RobotMemory';
import type { State } from '../RobotStateMachine';
import { beginLookAround, lookAround, perceptionTransition } from './shared';

/** Walk the patrol route, pausing and scanning at each waypoint. */
export class PatrolState implements State<RobotContext, RobotStateId> {
  readonly id = 'patrol' as const;

  enter(ctx: RobotContext): void {
    this.goToWaypoint(ctx);
  }

  update(ctx: RobotContext, dt: number): RobotStateId | null {
    const next = perceptionTransition(ctx);
    if (next) return next;

    const m = ctx.memory;
    if (m.phase === Phase.Moving) {
      if (ctx.controller.arrived) {
        m.phase = Phase.Looking;
        m.timer = ctx.world.rng.range(0.8, 2.2);
        beginLookAround(ctx);
      }
    } else {
      lookAround(ctx, dt);
      m.timer -= dt;
      if (m.timer <= 0) {
        m.routeIndex = (m.routeIndex + 1) % Math.max(1, m.routeLength);
        this.goToWaypoint(ctx);
      }
    }
    return null;
  }

  exit(): void {}

  private goToWaypoint(ctx: RobotContext): void {
    const m = ctx.memory;
    m.phase = Phase.Moving;
    if (m.routeLength === 0) return;
    ctx.controller.moveToCell(m.route[m.routeIndex]!, ctx.config.patrolSpeed);
  }
}
