import type { RobotStateId } from '../../core/types';
import type { RobotContext } from '../RobotContext';

/**
 * Common "calm state" perception transitions (Patrol / Return / Search):
 * certain sighting → Chase; partial sighting or a noise → Investigate.
 */
export function perceptionTransition(ctx: RobotContext): RobotStateId | null {
  const s = ctx.sensor;
  if (s.alerted) return 'chase';
  if (s.canSeePlayer && s.suspicion >= ctx.ai.investigateThreshold) {
    ctx.memory.setTarget(s.lastSeenX, s.lastSeenZ);
    return 'investigate';
  }
  if (s.consumeNoise()) {
    ctx.memory.setTarget(s.noiseX, s.noiseZ);
    return 'investigate';
  }
  return null;
}

/** Scan left/right around `memory.lookBase`. */
export function lookAround(ctx: RobotContext, dt: number): void {
  const m = ctx.memory;
  m.lookTime += dt;
  ctx.controller.turnTowards(m.lookBase + Math.sin(m.lookTime * 1.7) * 1.2, dt, 0.6);
}

export function beginLookAround(ctx: RobotContext): void {
  ctx.memory.lookBase = ctx.controller.heading;
  ctx.memory.lookTime = 0;
}
