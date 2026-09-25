import type { LampConfig } from '../config/types';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { clamp } from '../utils/math';
import type { Random } from '../utils/Random';

/**
 * Gameplay model of the portable lamp: battery, drain/recharge, light output and flicker.
 * It knows nothing about Three.js — `LampLight` renders `output`, the AI reads `isOn`.
 */
export class Lamp {
  private on = false;
  private battery: number;
  private rechargeTimer = 0;
  private flickerTimer = 0;
  private flickerValue = 1;
  /** Final light output 0..1 for the renderer. */
  output = 0;

  constructor(
    private config: LampConfig,
    private readonly rng: Random,
    private readonly events: EventBus<GameEvents>,
  ) {
    this.battery = config.batterySeconds;
  }

  get isOn(): boolean {
    return this.on;
  }

  get batteryFraction(): number {
    return this.config.batterySeconds > 0 ? this.battery / this.config.batterySeconds : 0;
  }

  get settings(): LampConfig {
    return this.config;
  }

  reset(config: LampConfig, startOn: boolean): void {
    this.config = config;
    this.battery = config.batterySeconds;
    this.on = startOn;
    this.rechargeTimer = 0;
    this.flickerValue = 1;
    this.output = startOn ? 1 : 0;
  }

  toggle(): void {
    if (this.on) {
      this.on = false;
      this.events.emit('lamp:toggled', { on: false });
      return;
    }
    if (this.batteryFraction < this.config.minBatteryToTurnOn) {
      this.events.emit('lamp:denied', undefined);
      return;
    }
    this.on = true;
    this.events.emit('lamp:toggled', { on: true });
  }

  update(dt: number): void {
    const c = this.config;
    if (this.on) {
      this.battery -= c.drainPerSecond * dt;
      this.rechargeTimer = c.rechargeDelay;
      if (this.battery <= 0) {
        this.battery = 0;
        this.on = false;
        this.events.emit('lamp:empty', undefined);
      }
    } else if (c.rechargePerSecond > 0) {
      this.rechargeTimer -= dt;
      if (this.rechargeTimer <= 0) this.battery = Math.min(c.batterySeconds, this.battery + c.rechargePerSecond * dt);
    }

    if (!this.on) {
      this.output = 0;
      return;
    }

    const frac = this.batteryFraction;
    const base = c.minOutput + (1 - c.minOutput) * Math.sqrt(frac);
    this.updateFlicker(dt, frac);
    this.output = clamp(base * this.flickerValue, 0, 1);
  }

  private updateFlicker(dt: number, frac: number): void {
    const c = this.config;
    this.flickerTimer -= dt;
    if (this.flickerTimer > 0) return;
    if (frac >= c.flickerBelow) {
      // Healthy lamp: a barely perceptible shimmer.
      this.flickerTimer = 0.08;
      this.flickerValue = 0.97 + this.rng.next() * 0.03;
      return;
    }
    const severity = 1 - frac / c.flickerBelow; // 0..1
    this.flickerTimer = this.rng.range(0.03, 0.2) * (1.2 - severity);
    if (this.rng.chance(0.08 + 0.35 * severity)) {
      this.flickerValue = this.rng.range(0, 0.35);
      this.events.emit('lamp:flicker', undefined);
    } else {
      this.flickerValue = this.rng.range(0.75, 1);
    }
  }
}
