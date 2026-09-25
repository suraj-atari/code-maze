import type { RobotStateId } from '../../core/types';
import type { RobotContext } from '../RobotContext';
import type { State } from '../RobotStateMachine';

/**
 * Pursue the player. While visible the robot re-paths to them every `chaseRepathSeconds`.
 * After losing sight it keeps tracking for a short "intuition" window, then heads for the last
 * known position; after `loseSightSeconds` it switches to Search.
 */
export class ChaseState implements State<RobotContext, RobotStateId> {
  readonly id = 'chase' as const;

  enter(ctx: RobotContext): void {
    ctx.memory.lostSightTimer = 0;
    ctx.memory.repathTimer = 0;
    ctx.sensor.suspicion = 1;
  }

  update(ctx: RobotContext, dt: number): RobotStateId | null {
    const s = ctx.sensor;
    const m = ctx.memory;
    const ai = ctx.ai;

    if (s.canSeePlayer) m.lostSightTimer = 0;
    else m.lostSightTimer += dt;

    if (m.lostSightTimer > ai.loseSightSeconds) {
      m.setTarget(s.lastSeenX, s.lastSeenZ);
      return 'search';
    }

    m.repathTimer -= dt;
    if (m.repathTimer <= 0) {
      m.repathTimer = ai.chaseRepathSeconds;
      const tracking = m.lostSightTimer < ai.loseSightSeconds * 0.5;
      const p = ctx.world.player.position;
      const tx = tracking ? p.x : s.lastSeenX;
      const tz = tracking ? p.z : s.lastSeenZ;
      ctx.controller.moveToPoint(tx, tz, ctx.config.chaseSpeed);
    }
    return null;
  }

  exit(): void {}
}
