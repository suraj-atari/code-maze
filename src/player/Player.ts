import type { PlayerConfig } from '../config/types';
import type { EventBus } from '../core/EventBus';
import type { FootstepEvent, GameEvents } from '../core/GameEvents';
import type { InputState } from '../input/InputState';
import type { PhysicsSystem } from '../physics/PhysicsSystem';
import { clamp, damp } from '../utils/math';
import type { Lamp } from './Lamp';
import { PlayerController } from './PlayerController';

/** What robots are allowed to know about the player. */
export interface PlayerPerception {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  /** Current noise radius in metres (0 when still). */
  readonly noiseRadius: number;
  readonly lampOn: boolean;
  readonly crouching: boolean;
}

/**
 * Player gameplay: turns input into movement intent, manages stamina, sprint/crouch,
 * noise emission and footsteps, and owns the lamp.
 */
export class Player implements PlayerPerception {
  yaw = 0;
  pitch = 0;
  crouching = false;
  sprinting = false;
  noiseRadius = 0;
  stamina: number;
  /** 0..1 fraction of sprint speed, for head bob. */
  moveFactor = 0;
  /** Actual horizontal speed (m/s) this frame, for the third-person animation. */
  speed = 0;

  private readonly controller: PlayerController;
  private velX = 0;
  private velZ = 0;
  private staminaDelay = 0;
  private stepDistance = 0;
  private readonly footstep: FootstepEvent = { x: 0, y: 0, z: 0, loudness: 0 };

  constructor(
    physics: PhysicsSystem,
    private readonly config: PlayerConfig,
    readonly lamp: Lamp,
    private readonly events: EventBus<GameEvents>,
  ) {
    this.controller = new PlayerController(physics, config);
    this.stamina = config.stamina.max;
  }

  get position(): { readonly x: number; readonly y: number; readonly z: number } {
    return this.controller.position;
  }

  get lampOn(): boolean {
    return this.lamp.isOn;
  }

  /** Height of the eyes above the feet (crouch aware), e.g. where grenades are thrown from. */
  get eyeHeight(): number {
    return this.crouching ? this.config.crouchEyeHeight : this.config.eyeHeight;
  }

  get staminaFraction(): number {
    return this.stamina / this.config.stamina.max;
  }

  spawn(x: number, z: number, yaw: number): void {
    this.controller.spawn(x, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.velX = this.velZ = 0;
    this.stamina = this.config.stamina.max;
    this.crouching = this.sprinting = false;
    this.noiseRadius = 0;
    this.stepDistance = 0;
  }

  despawn(): void {
    this.controller.despawn();
  }

  /** Instantly moves the player (debug / scripted events). Keeps orientation and stats. */
  teleport(x: number, z: number): void {
    this.controller.spawn(x, z);
    this.velX = this.velZ = 0;
  }

  update(dt: number, input: InputState): void {
    const c = this.config;

    this.yaw -= input.lookX;
    this.pitch = clamp(this.pitch - input.lookY, -c.maxPitch, c.maxPitch);
    if (input.lampPressed) this.lamp.toggle();
    this.lamp.update(dt);

    const inputMag = Math.min(1, Math.hypot(input.moveX, input.moveY));
    const moving = inputMag > 0.01;
    this.crouching = input.crouch;
    this.updateStamina(dt, input.sprint && moving && !this.crouching);

    const speed = this.crouching ? c.crouchSpeed : this.sprinting ? c.sprintSpeed : c.walkSpeed;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const targetX = (input.moveX * cos - input.moveY * sin) * speed;
    const targetZ = (-input.moveX * sin - input.moveY * cos) * speed;
    this.velX = damp(this.velX, targetX, c.acceleration, dt);
    this.velZ = damp(this.velZ, targetZ, c.acceleration, dt);

    const beforeX = this.controller.position.x;
    const beforeZ = this.controller.position.z;
    this.controller.move(this.velX * dt, this.velZ * dt, dt);
    const moved = Math.hypot(this.controller.position.x - beforeX, this.controller.position.z - beforeZ);
    const actualSpeed = dt > 0 ? moved / dt : 0;
    this.moveFactor = clamp(actualSpeed / c.sprintSpeed, 0, 1);
    this.speed = actualSpeed;

    this.updateNoise(actualSpeed, moved);
  }

  private updateStamina(dt: number, wantsSprint: boolean): void {
    const s = this.config.stamina;
    if (wantsSprint && (this.sprinting ? this.stamina > 0 : this.stamina >= s.minToSprint)) {
      this.sprinting = true;
      this.stamina = Math.max(0, this.stamina - s.drainPerSecond * dt);
      this.staminaDelay = s.regenDelay;
    } else {
      this.sprinting = false;
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(s.max, this.stamina + s.regenPerSecond * dt);
    }
  }

  private updateNoise(actualSpeed: number, moved: number): void {
    const c = this.config;
    if (actualSpeed < 0.3) {
      this.noiseRadius = 0;
      return;
    }
    const mode = this.crouching ? 'crouch' : this.sprinting ? 'sprint' : 'walk';
    // Scale by how fast we actually move, so a gentle joystick push is quieter.
    const speedRatio = clamp(actualSpeed / (this.sprinting ? c.sprintSpeed : c.walkSpeed), 0.3, 1);
    this.noiseRadius = c.noiseRadius[mode] * speedRatio;

    this.stepDistance += moved;
    if (this.stepDistance >= c.stepLength[mode]) {
      this.stepDistance = 0;
      const p = this.controller.position;
      this.footstep.x = p.x;
      this.footstep.y = p.y;
      this.footstep.z = p.z;
      this.footstep.loudness = mode === 'sprint' ? 1 : mode === 'walk' ? 0.55 * speedRatio : 0.18;
      this.events.emit('player:footstep', this.footstep);
    }
  }
}
