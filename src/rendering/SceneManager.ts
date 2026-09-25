import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { GraphicsQuality } from '../config/types';

/** Lowest render resolution adaptive mode may drop to (fraction of a CSS pixel). */
const MIN_PIXEL_RATIO = 0.7;
/** Seconds between resolution changes (each one reallocates the drawing buffer). */
const ADAPT_INTERVAL = 1.5;

/**
 * Owns the WebGL renderer, the scene graph root and the first-person camera.
 * On low-power devices it adapts the render resolution to keep the frame rate up: slow frames
 * lower the pixel ratio step by step, sustained headroom raises it back (never above the cap).
 */
export class SceneManager {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private pixelRatio: number;
  private readonly maxPixelRatio: number;
  private frameAvg = 1 / 60;
  private adaptTimer = 0;

  constructor(
    private readonly container: HTMLElement,
    readonly quality: GraphicsQuality,
    fovDeg: number,
  ) {
    this.renderer = new WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.maxPixelRatio = Math.min(window.devicePixelRatio, quality.pixelRatioCap);
    this.pixelRatio = this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(fovDeg, 1, 0.05, 150);
    this.camera.rotation.order = 'YXZ';
    // The camera is part of the scene so that children (the lamp) are rendered.
    this.scene.add(this.camera);

    this.resize();
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Call once per frame with the frame time (only acts when `adaptive`). */
  adapt(dt: number, adaptive: boolean): void {
    if (!adaptive || dt <= 0) return;
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    this.adaptTimer += dt;
    if (this.adaptTimer < ADAPT_INTERVAL) return;
    let next = this.pixelRatio;
    // Below ~40 fps: drop; comfortably at ~55+ fps: creep back up (more cautiously).
    if (this.frameAvg > 1 / 40) next = Math.max(MIN_PIXEL_RATIO, this.pixelRatio - 0.15);
    else if (this.frameAvg < 1 / 55) next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.1);
    if (next === this.pixelRatio) return;
    this.adaptTimer = next > this.pixelRatio ? -ADAPT_INTERVAL : 0;
    this.pixelRatio = next;
    this.renderer.setPixelRatio(next);
    this.resize();
  }

  private readonly resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
