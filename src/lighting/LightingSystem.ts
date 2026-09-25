import { AmbientLight, Color, FogExp2, HemisphereLight, PointLight, type Scene } from 'three';
import type { GraphicsConfig } from '../config/types';
import type { EventBus } from '../core/EventBus';
import type { GameEvents, RobotStateEvent } from '../core/GameEvents';
import { ObjectPool } from '../pooling/ObjectPool';
import type { ObjectPoolManager } from '../pooling/ObjectPoolManager';
import { lerp } from '../utils/math';

class FlashLight {
  readonly light: PointLight;
  time = 0;
  duration = 0;
  peak = 0;

  constructor() {
    this.light = new PointLight(0xffffff, 0, 8, 2);
  }
}

/**
 * Global atmosphere: ambient darkness, fog density and short-lived flash lights (alerts).
 * Flash lights are pooled and permanently in the scene with 0 intensity, so the number of
 * lights never changes at runtime (changing it would force shader recompiles).
 */
export class LightingSystem {
  private readonly ambient: AmbientLight;
  private readonly hemi: HemisphereLight;
  private readonly fog: FogExp2;
  private readonly flashes: ObjectPool<FlashLight>;
  private readonly activeFlashes: FlashLight[] = [];
  private darkness = 0.5;

  constructor(
    scene: Scene,
    private readonly config: GraphicsConfig,
    events: EventBus<GameEvents>,
    pools: ObjectPoolManager,
  ) {
    this.ambient = new AmbientLight(config.ambientColor, 0.2);
    scene.add(this.ambient);
    this.hemi = new HemisphereLight(config.hemiSkyColor, config.hemiGroundColor, 1);
    scene.add(this.hemi);
    this.fog = new FogExp2(config.fogColor, 0.05);
    scene.fog = this.fog;
    scene.background = new Color(config.fogColor);

    this.flashes = pools.register(
      new ObjectPool<FlashLight>(
        'flash-lights',
        () => {
          const f = new FlashLight();
          scene.add(f.light);
          return f;
        },
        (f) => (f.light.intensity = 0),
        config.flashLights,
        config.flashLights,
      ),
    );

    events.on('robot:stateChanged', this.onRobotState);
    events.on('weapon:explosion', (e) => this.flash(e.x, e.y + 0.5, e.z, 0xff8a2a, 80, 0.7));
    events.on('robot:destroyed', (e) => this.flash(e.x, e.y, e.z, 0x6fdcff, 25, 0.45));
    events.on('weapon:nullifierPulse', (e) => this.flash(e.x, e.y + 0.8, e.z, 0x9a5cff, 45, 0.7));
  }

  /** 0 = dim, 1 = pitch black. */
  setDarkness(darkness: number): void {
    this.darkness = darkness;
    const c = this.config;
    this.ambient.intensity = lerp(c.ambientIntensity[0], c.ambientIntensity[1], darkness);
    this.hemi.intensity = lerp(c.hemiIntensity[0], c.hemiIntensity[1], darkness);
    this.fog.density = lerp(c.fogDensity[0], c.fogDensity[1], darkness);
  }

  /** Emissive intensity for wall light strips at the current darkness. */
  get wallEmissive(): number {
    return lerp(this.config.wallEmissive[0], this.config.wallEmissive[1], this.darkness);
  }

  flash(x: number, y: number, z: number, color: number, intensity: number, duration: number): void {
    const f = this.flashes.acquire();
    if (!f) return;
    f.light.position.set(x, y, z);
    f.light.color.setHex(color);
    f.peak = intensity;
    f.time = 0;
    f.duration = duration;
    this.activeFlashes.push(f);
  }

  update(dt: number): void {
    for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
      const f = this.activeFlashes[i]!;
      f.time += dt;
      const t = f.time / f.duration;
      if (t >= 1) {
        this.activeFlashes[i] = this.activeFlashes[this.activeFlashes.length - 1]!;
        this.activeFlashes.pop();
        this.flashes.release(f);
        continue;
      }
      // Fast attack, exponential-ish decay.
      f.light.intensity = f.peak * (t < 0.1 ? t / 0.1 : (1 - t) * (1 - t));
    }
  }

  clearFlashes(): void {
    for (const f of this.activeFlashes) this.flashes.release(f);
    this.activeFlashes.length = 0;
  }

  private readonly onRobotState = (e: RobotStateEvent): void => {
    if (e.to === 'chase') this.flash(e.x, e.y, e.z, 0xff2030, 30, 0.9);
  };
}
