import type { Camera } from 'three';
import type { EventBus } from '../core/EventBus';
import type { GameEvents, PositionEvent, RobotStateEvent } from '../core/GameEvents';
import type { Random } from '../utils/Random';
import type { EmitParams, ParticleSystem } from './ParticleSystem';

const SPARKS: EmitParams = { count: 40, color: 0xff5a3a, speed: 2.8, life: 0.7, gravity: 9, drag: 1.5, spread: 0.3, lift: 1.5 };
const SCAN: EmitParams = { count: 12, color: 0xffd23a, speed: 0.8, life: 0.6, gravity: 0, drag: 2, spread: 0.4, lift: 0.3 };
const DUST: EmitParams = { count: 1, color: 0x9a9384, speed: 0.06, life: 5, gravity: -0.01, drag: 0.2, spread: 3.5, lift: 0 };
const FIRE: EmitParams = { count: 90, color: 0xff8a2a, speed: 5.5, life: 0.55, gravity: 2, drag: 3.5, spread: 0.6, lift: 1.5 };
const EMBERS: EmitParams = { count: 40, color: 0xffd060, speed: 7, life: 1.2, gravity: 9, drag: 1.2, spread: 0.4, lift: 3 };
const SMOKE: EmitParams = { count: 30, color: 0x4a4540, speed: 1.4, life: 2.4, gravity: -0.6, drag: 1.2, spread: 1.4, lift: 0.8 };
const DEBRIS: EmitParams = { count: 45, color: 0x2fd8ff, speed: 3.5, life: 1, gravity: 9, drag: 1, spread: 0.6, lift: 2.5 };
const EXIT_MOTES: EmitParams = { count: 1, color: 0x35ff9a, speed: 0.15, life: 2.2, gravity: -0.4, drag: 0.5, spread: 1.4, lift: 0.2 };

/** Gameplay-facing effects built on the particle system (sparks, dust, exit motes, explosions). */
export class EffectsManager {
  private dustTimer = 0;
  private exitTimer = 0;
  private exitX = 0;
  private exitZ = 0;
  private exitActive = false;
  private readonly random: () => number;

  constructor(
    private readonly particles: ParticleSystem,
    private readonly camera: Camera,
    rng: Random,
    events: EventBus<GameEvents>,
  ) {
    this.random = () => rng.next();
    events.on('robot:stateChanged', this.onRobotState);
    events.on('weapon:explosion', this.onExplosion);
    events.on('weapon:hammerHit', (e) => this.particles.emit(e.x, e.y, e.z, SPARKS, this.random));
    events.on('robot:destroyed', (e) => {
      this.particles.emit(e.x, e.y, e.z, SPARKS, this.random);
      this.particles.emit(e.x, e.y, e.z, DEBRIS, this.random);
    });
  }

  setExit(x: number, z: number): void {
    this.exitX = x;
    this.exitZ = z;
    this.exitActive = true;
  }

  sparks(x: number, y: number, z: number): void {
    this.particles.emit(x, y, z, SPARKS, this.random);
  }

  /** @param lampOutput dust is only visible (and only spawned) in the lamp beam. */
  update(dt: number, lampOutput: number): void {
    this.dustTimer -= dt;
    if (lampOutput > 0.2 && this.dustTimer <= 0) {
      this.dustTimer = 0.06;
      // Spawn dust a few metres in front of the camera, inside the beam.
      const e = this.camera.matrixWorld.elements;
      const d = 2 + this.random() * 3;
      this.particles.emit(e[12]! - e[8]! * d, e[13]! - e[9]! * d, e[14]! - e[10]! * d, DUST, this.random);
    }

    if (this.exitActive) {
      this.exitTimer -= dt;
      if (this.exitTimer <= 0) {
        this.exitTimer = 0.08;
        this.particles.emit(this.exitX, 0.4, this.exitZ, EXIT_MOTES, this.random);
      }
    }
    this.particles.update(dt);
  }

  clear(): void {
    this.exitActive = false;
    this.particles.clear();
  }

  private readonly onExplosion = (e: PositionEvent): void => {
    this.particles.emit(e.x, e.y, e.z, FIRE, this.random);
    this.particles.emit(e.x, e.y, e.z, EMBERS, this.random);
    this.particles.emit(e.x, e.y + 0.3, e.z, SMOKE, this.random);
  };

  private readonly onRobotState = (e: RobotStateEvent): void => {
    if (e.to === 'chase') this.particles.emit(e.x, e.y, e.z, SPARKS, this.random);
    else if (e.to === 'investigate' || e.to === 'search') this.particles.emit(e.x, e.y, e.z, SCAN, this.random);
  };
}
