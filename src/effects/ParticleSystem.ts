import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Points,
  PointsMaterial,
  type Scene,
} from 'three';
import { ObjectPool } from '../pooling/ObjectPool';
import type { ObjectPoolManager } from '../pooling/ObjectPoolManager';

export class Particle {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  life = 0;
  maxLife = 1;
  r = 1;
  g = 1;
  b = 1;
  gravity = 0;
  drag = 0;
}

export interface EmitParams {
  count: number;
  color: number;
  speed: number;
  life: number;
  gravity: number;
  drag: number;
  /** Positional jitter radius. */
  spread: number;
  /** Extra upward velocity. */
  lift: number;
}

function makeSprite(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/**
 * All particles share one `Points` draw call. Particles are pooled structs; each frame the
 * live ones are compacted into the front of the GPU buffers and drawRange is set to the count.
 */
export class ParticleSystem {
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry = new BufferGeometry();
  private readonly material: PointsMaterial;
  private readonly sprite = makeSprite();
  private readonly points: Points;
  private readonly pool: ObjectPool<Particle>;
  private readonly live: Particle[] = [];

  constructor(scene: Scene, capacity: number, pools: ObjectPoolManager) {
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);
    this.material = new PointsMaterial({
      size: 0.07,
      map: this.sprite,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      fog: true,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'particles';
    scene.add(this.points);
    this.pool = pools.register(new ObjectPool('particles', () => new Particle(), undefined, capacity, capacity));
  }

  get liveCount(): number {
    return this.live.length;
  }

  emit(x: number, y: number, z: number, p: EmitParams, random: () => number): void {
    const r = ((p.color >> 16) & 255) / 255;
    const g = ((p.color >> 8) & 255) / 255;
    const b = (p.color & 255) / 255;
    for (let i = 0; i < p.count; i++) {
      const part = this.pool.acquire();
      if (!part) return;
      part.x = x + (random() - 0.5) * p.spread;
      part.y = y + (random() - 0.5) * p.spread;
      part.z = z + (random() - 0.5) * p.spread;
      part.vx = (random() - 0.5) * 2 * p.speed;
      part.vy = (random() - 0.5) * 2 * p.speed + p.lift;
      part.vz = (random() - 0.5) * 2 * p.speed;
      part.maxLife = p.life * (0.6 + 0.4 * random());
      part.life = part.maxLife;
      part.r = r;
      part.g = g;
      part.b = b;
      part.gravity = p.gravity;
      part.drag = p.drag;
      this.live.push(part);
    }
  }

  update(dt: number): void {
    const pos = this.positions;
    const col = this.colors;
    let n = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.live[i] = this.live[this.live.length - 1]!;
        this.live.pop();
        this.pool.release(p);
        continue;
      }
      const dragF = Math.max(0, 1 - p.drag * dt);
      p.vx *= dragF;
      p.vy = (p.vy - p.gravity * dt) * dragF;
      p.vz *= dragF;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy *= -0.3;
      }
      // Additive blending: fading the colour to black fades the particle out.
      const t = p.life / p.maxLife;
      const o = n * 3;
      pos[o] = p.x;
      pos[o + 1] = p.y;
      pos[o + 2] = p.z;
      col[o] = p.r * t;
      col[o + 1] = p.g * t;
      col[o + 2] = p.b * t;
      n++;
    }
    this.geometry.setDrawRange(0, n);
    if (n > 0) {
      (this.geometry.attributes['position'] as BufferAttribute).needsUpdate = true;
      (this.geometry.attributes['color'] as BufferAttribute).needsUpdate = true;
    }
  }

  clear(): void {
    for (const p of this.live) this.pool.release(p);
    this.live.length = 0;
    this.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.clear();
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.sprite.dispose();
  }
}
