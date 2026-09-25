import type { Camera, Object3D } from 'three';
import { clamp, damp } from '../utils/math';
import type { WeaponModels } from './WeaponModels';

const SWING_SECONDS = 0.38;
const IDLE_TILT = -0.35;

/** The hammer held in the bottom-right of the first-person view, with a wind-up/strike swing. */
export class HammerViewModel {
  private readonly model: Object3D;
  private swingT = -1;
  private lower = 1;

  constructor(camera: Camera, models: WeaponModels) {
    this.model = models.hammer(true);
    this.model.scale.setScalar(0.42);
    this.model.visible = false;
    camera.add(this.model);
  }

  swing(): void {
    this.swingT = 0;
  }

  update(dt: number, time: number, held: boolean, moveFactor: number): void {
    // Raise/lower the hammer when it is picked up or breaks.
    this.lower = damp(this.lower, held ? 0 : 1, 10, dt);
    this.model.visible = this.lower < 0.98;
    if (!this.model.visible) return;

    let tilt = IDLE_TILT;
    let lunge = 0;
    if (this.swingT >= 0) {
      this.swingT += dt;
      const t = clamp(this.swingT / SWING_SECONDS, 0, 1);
      if (t < 0.3) {
        tilt = IDLE_TILT + 0.6 * (t / 0.3); // wind up
      } else if (t < 0.55) {
        const k = (t - 0.3) / 0.25;
        tilt = IDLE_TILT + 0.6 - 1.9 * k; // strike
        lunge = k;
      } else {
        const k = (t - 0.55) / 0.45;
        tilt = IDLE_TILT - 1.3 * (1 - k); // recover
        lunge = 1 - k;
      }
      if (t >= 1) this.swingT = -1;
    }

    const sway = Math.sin(time * 9) * 0.012 * moveFactor;
    const m = this.model;
    m.position.set(0.2 + sway, -0.29 - this.lower * 0.45 + Math.abs(sway), -0.36 - lunge * 0.12);
    m.rotation.set(tilt, 0.1, -0.22 - lunge * 0.25);
  }

  hide(): void {
    this.lower = 1;
    this.swingT = -1;
    this.model.visible = false;
  }

  dispose(): void {
    this.model.removeFromParent();
  }
}
