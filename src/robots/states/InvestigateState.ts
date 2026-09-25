import type { RobotStateId } from '../../core/types';
import type { RobotContext } from '../RobotContext';
import { Phase } from '../RobotMemory';
import type { State } from '../RobotStateMachine';
import { beginLookAround, lookAround } from './shared';

const REPATH_WHILE_WATCHING = 0.5;

/**
 * Move to a suspicious point (glimpse, noise or a radio alert: the player's last known
 * position), look around, then give up and return. Alerts are answered at alert speed.
 */
export class InvestigateState implements State<RobotContext, RobotStateId> {
  readonly id = 'investigate' as const;

  enter(ctx: RobotContext): void {
    ctx.memory.repathTimer = REPATH_WHILE_WATCHING;
    this.goToTarget(ctx);
  }

  update(ctx: RobotContext, dt: number): RobotStateId | null {
    const s = ctx.sensor;
    const m = ctx.memory;
    if (s.alerted) return 'chase';

    // Keep homing in while the player is (partially) visible.
    m.repathTimer -= dt;
    if (s.canSeePlayer && m.repathTimer <= 0) {
      m.repathTimer = REPATH_WHILE_WATCHING;
      m.setTarget(s.lastSeenX, s.lastSeenZ);
      this.goToTarget(ctx);
    }
    if (s.consumeNoise()) {
      m.setTarget(s.noiseX, s.noiseZ);
      m.urgent = m.urgent || s.noiseUrgent;
      this.goToTarget(ctx);
    }

    if (m.phase === Phase.Moving) {
      if (ctx.controller.arrived) {
        m.phase = Phase.Looking;
        m.timer = ctx.ai.lookAroundSeconds;
        beginLookAround(ctx);
      }
      return null;
    }

    lookAround(ctx, dt);
    m.timer -= dt;
    return m.timer <= 0 ? 'return' : null;
  }

  exit(): void {}

  private goToTarget(ctx: RobotContext): void {
    const m = ctx.memory;
    m.phase = Phase.Moving;
    const speed = m.urgent ? ctx.config.chaseSpeed * ctx.ai.alertSpeedFactor : ctx.config.investigateSpeed;
    if (!ctx.controller.moveToPoint(m.targetX, m.targetZ, speed)) {
      ctx.controller.stop();
    }
  }
}
