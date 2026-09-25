import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { RobotInfo, Vec3Like } from '../core/types';
import type { PhysicsSystem } from '../physics/PhysicsSystem';
import type { ObjectPoolManager } from '../pooling/ObjectPoolManager';

export interface DebugSource {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly physics: PhysicsSystem;
  readonly pools: ObjectPoolManager;
  robots(): readonly RobotInfo[];
  playerPosition(): Readonly<Vec3Like> | null;
  particleCount(): number;
  state(): string;
  /** Cheats for testing flows quickly. */
  teleportToExit(): void;
  teleportToRobot(): void;
  teleportToArmory(): void;
  skipTutorialStep(): void;
}

/**
 * Development overlay. Loaded through a dynamic import only in dev builds or with `?debug`,
 * so it is a separate chunk that production players never download.
 *   F2 / `  toggle overlay      F3  toggle collider wireframes
 */
export class DebugSystem {
  private readonly panel: HTMLPreElement;
  private visible = true;
  private showColliders = false;
  private lines: LineSegments | null = null;
  private lastTime = 0;
  private frameMs = 16;
  private fps = 60;
  private textTimer = 0;
  private colliderTimer = 0;

  constructor(private readonly src: DebugSource) {
    this.panel = document.createElement('pre');
    Object.assign(this.panel.style, {
      position: 'fixed',
      right: '8px',
      bottom: '8px',
      margin: '0',
      padding: '8px 10px',
      font: '11px/1.35 monospace',
      color: '#9fe8ff',
      background: 'rgba(0,0,0,0.65)',
      border: '1px solid rgba(47,216,255,0.3)',
      zIndex: '40',
      pointerEvents: 'none',
      whiteSpace: 'pre',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.append(this.panel);
    window.addEventListener('keydown', this.onKey);
  }

  update(dt: number): void {
    // Wall-clock frame time (the game's dt is clamped, which would hide slow frames).
    const now = performance.now();
    if (this.lastTime > 0) {
      this.frameMs += (now - this.lastTime - this.frameMs) * 0.1;
      this.fps = 1000 / this.frameMs;
    }
    this.lastTime = now;

    this.colliderTimer -= dt;
    if (this.showColliders && this.colliderTimer <= 0) {
      this.colliderTimer = 0.1;
      this.updateColliderLines();
    }

    this.textTimer -= dt;
    if (!this.visible || this.textTimer > 0) return;
    this.textTimer = 0.25;

    const { renderer, physics, pools } = this.src;
    const info = renderer.info;
    const p = this.src.playerPosition();
    const lines = [
      `FPS ${this.fps.toFixed(0).padStart(3)}   frame ${this.frameMs.toFixed(2)} ms`,
      `state      ${this.src.state()}`,
      `draw calls ${info.render.calls}   tris ${info.render.triangles}`,
      `geometries ${info.memory.geometries}   textures ${info.memory.textures}   programs ${info.programs?.length ?? 0}`,
      `physics    bodies ${physics.bodyCount}   colliders ${physics.colliderCount}`,
      `particles  ${this.src.particleCount()}`,
      `player     ${p ? `${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)}` : '-'}`,
      'pools:',
      ...pools.all.map((pool) => `  ${pool.name.padEnd(14)} active ${String(pool.active).padStart(3)}  free ${pool.free}`),
      'robots:',
      ...this.src.robots().map(
        (r) =>
          `  #${r.id} ${r.stateId.padEnd(11)} susp ${r.suspicion.toFixed(2)}  @ ${r.position.x.toFixed(1)}, ${r.position.z.toFixed(1)}`,
      ),
      '[F2] overlay  [F3] colliders' + (this.showColliders ? ' (on)' : '') + '  [F4] tp exit  [F6] tp robot  [F7] tp armory  [F8] skip tutorial step',
    ];
    this.panel.textContent = lines.join('\n');
  }

  private updateColliderLines(): void {
    const { vertices, colors } = this.src.physics.debugBuffers();
    if (!this.lines) {
      const geo = new BufferGeometry();
      this.lines = new LineSegments(geo, new LineBasicMaterial({ vertexColors: true, depthTest: false, fog: false }));
      this.lines.frustumCulled = false;
      this.lines.renderOrder = 999;
      this.src.scene.add(this.lines);
    }
    const geo = this.lines.geometry;
    geo.setAttribute('position', new BufferAttribute(vertices, 3));
    geo.setAttribute('color', new BufferAttribute(colors, 4));
    this.lines.visible = true;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'F2' || e.code === 'Backquote') {
      e.preventDefault();
      this.visible = !this.visible;
      this.panel.style.display = this.visible ? 'block' : 'none';
    } else if (e.code === 'F3') {
      e.preventDefault();
      this.showColliders = !this.showColliders;
      if (!this.showColliders && this.lines) this.lines.visible = false;
    } else if (e.code === 'F4') {
      e.preventDefault();
      this.src.teleportToExit();
    } else if (e.code === 'F6') {
      e.preventDefault();
      this.src.teleportToRobot();
    } else if (e.code === 'F7') {
      e.preventDefault();
      this.src.teleportToArmory();
    } else if (e.code === 'F8') {
      e.preventDefault();
      this.src.skipTutorialStep();
    }
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.panel.remove();
    if (this.lines) {
      this.lines.removeFromParent();
      this.lines.geometry.dispose();
      (this.lines.material as LineBasicMaterial).dispose();
    }
  }
}
