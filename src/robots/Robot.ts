import type { AIConfig, RobotConfig } from '../config/types';
import type { RobotInfo, RobotStateId, Vec3Like } from '../core/types';
import type { PhysicsSystem } from '../physics/PhysicsSystem';
import type { RobotBehaviour, RobotStateMachine } from './RobotBehaviour';
import type { RobotContext, RobotWorld } from './RobotContext';
import { RobotController } from './RobotController';
import { RobotMemory } from './RobotMemory';
import { RobotSensor } from './RobotSensor';
import { StateMachine, type StateChangeHandler } from './RobotStateMachine';
import type { RobotView } from './RobotView';

export interface RobotActivation {
  readonly physics: PhysicsSystem;
  readonly config: RobotConfig;
  readonly ai: AIConfig;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly route: readonly number[];
  readonly sensorStagger: number;
}

/**
 * A robot is a composition of: controller (movement), sensor (perception), memory
 * (blackboard), state machine (behaviour) and view (visuals). Robots are pooled and
 * re-activated for each level.
 */
export class Robot implements RobotContext, RobotInfo {
  readonly controller = new RobotController();
  readonly sensor = new RobotSensor();
  readonly memory = new RobotMemory();
  private readonly machine: RobotStateMachine;
  config!: RobotConfig;
  ai!: AIConfig;
  active = false;
  /** Seconds of paralysis left (robot nullifier). */
  private stunTimer = 0;

  constructor(
    readonly id: number,
    readonly view: RobotView,
    readonly world: RobotWorld,
    private readonly behaviour: RobotBehaviour,
    onStateChange: (robot: Robot, from: RobotStateId | null, to: RobotStateId) => void,
  ) {
    const handler: StateChangeHandler<RobotStateId> = (from, to) => onStateChange(this, from, to);
    this.machine = new StateMachine<RobotContext, RobotStateId>(this, handler);
    behaviour.install(this.machine);
  }

  get stateId(): RobotStateId {
    return this.machine.currentId ?? this.behaviour.initialState;
  }

  get position(): Readonly<Vec3Like> {
    return this.controller.position;
  }

  get suspicion(): number {
    return this.stunned ? 0 : this.sensor.suspicion;
  }

  /** Paralysed by a nullifier pulse: frozen, blind and harmless until the timer runs out. */
  get stunned(): boolean {
    return this.stunTimer > 0;
  }

  stun(seconds: number): void {
    this.stunTimer = Math.max(this.stunTimer, seconds);
  }

  activate(a: RobotActivation): void {
    this.config = a.config;
    this.ai = a.ai;
    this.controller.bind(this.world, a.config);
    this.controller.spawn(a.physics, a.x, a.z, a.heading);
    this.sensor.reset(a.sensorStagger);
    this.memory.reset();
    this.memory.setRoute(a.route);
    this.stunTimer = 0;
    this.active = true;
    this.view.setVisible(true);
    this.machine.change(this.behaviour.initialState);
  }

  deactivate(): void {
    this.machine.stop();
    this.controller.despawn();
    this.view.setVisible(false);
    this.active = false;
  }

  update(dt: number, time: number): void {
    if (this.stunTimer > 0) {
      // AI and movement are suspended; the kinematic body simply stays where it is.
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      this.controller.currentSpeed = 0;
      const p = this.controller.position;
      this.view.update(p.x, p.z, this.controller.heading, this.stateId, this.config, time, dt, this.stunTimer);
      return;
    }
    this.sensor.update(dt, this.controller, this.world, this.ai);
    this.machine.update(dt);
    this.controller.update(dt);
    const p = this.controller.position;
    this.view.update(p.x, p.z, this.controller.heading, this.stateId, this.config, time, dt, 0);
  }
}
