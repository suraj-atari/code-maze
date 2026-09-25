import type { PerspectiveCamera } from 'three';
import type { PlayerConfig } from '../config/types';
import { damp } from '../utils/math';

export interface CameraRigInput {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly crouching: boolean;
  /** 0..1 fraction of sprint speed, drives head bob. */
  readonly moveFactor: number;
}

/** Places the camera at the player's eyes with crouch smoothing and head bob. */
export class FirstPersonCamera {
  private eyeHeight: number;
  private bobPhase = 0;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly config: PlayerConfig,
  ) {
    this.eyeHeight = config.eyeHeight;
  }

  reset(): void {
    this.eyeHeight = this.config.eyeHeight;
    this.bobPhase = 0;
  }

  update(p: CameraRigInput, dt: number): void {
    const c = this.config;
    this.eyeHeight = damp(this.eyeHeight, p.crouching ? c.crouchEyeHeight : c.eyeHeight, 10, dt);

    let bobY = 0;
    let bobX = 0;
    if (p.moveFactor > 0.05) {
      this.bobPhase += dt * c.headBob.frequency * Math.PI * 2 * (0.6 + p.moveFactor);
      bobY = Math.sin(this.bobPhase * 2) * c.headBob.amplitude * p.moveFactor;
      bobX = Math.cos(this.bobPhase) * c.headBob.amplitude * 0.5 * p.moveFactor;
    }

    const cosYaw = Math.cos(p.yaw);
    const sinYaw = Math.sin(p.yaw);
    this.camera.position.set(p.x + cosYaw * bobX, p.y + this.eyeHeight + bobY, p.z - sinYaw * bobX);
    this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
  }
}
