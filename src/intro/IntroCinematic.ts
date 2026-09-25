import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  FogExp2,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Quaternion,
  type Scene,
} from 'three';
import type { MazeData } from '../maze/MazeData';
import { drawMazeMap, MAP_COLORS } from '../maze/MazeMapImage';
import { clamp } from '../utils/math';

// Timeline (seconds), after the reference intro: fade in on the flat map, hold, crossfade to
// the flat 3D board, then one long eased dive into the player's eyes.
const FADE_IN = 0.6;
const HOLD = 2.4;
const XFADE = 3.2;
const ZOOM_END = 9.0;
/** Walls start almost flat (the 2D map) and grow to full height during the dive. */
const FLAT_SCALE = 0.012;
const TOP_FOV = 30;
const INTRO_FAR = 1200;
/** Wall tops fade from map green to the interior's dark metal. */
const TOP_INSIDE = new Color(0x3b4744);

/** What the DOM overlay shows: labels in screen space (0..1) and fade levels. */
export interface IntroOverlayModel {
  youX: number;
  youY: number;
  exitX: number;
  exitY: number;
  /** Title / objective text. */
  titleAlpha: number;
  /** YOU / EXIT labels. */
  labelAlpha: number;
  /** Black cover, for the fade in. */
  fadeAlpha: number;
}

const remap = (x: number, a: number, b: number): number => clamp((x - a) / (b - a), 0, 1);
const smooth = (x: number): number => x * x * (3 - 2 * x);
const easeInOut = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/**
 * Level intro: the maze as the flat top-down map (player and exit marked); it crossfades into
 * a flat 3D board (green wall tops on a sandy floor), then the camera dives down onto the player
 * — walls rising, the view rolling upright and widening, the lights going from flat daylight to
 * the dark lab — and lands exactly on the gameplay camera.
 * Owns its meshes and one ambient light; everything it changes on the scene is restored by `end`.
 */
export class IntroCinematic {
  readonly overlay: IntroOverlayModel = {
    youX: 0,
    youY: 0,
    exitX: 0,
    exitY: 0,
    titleAlpha: 0,
    labelAlpha: 0,
    fadeAlpha: 0,
  };
  private readonly root = new Group();
  // Painted map (with markers), shown during the hold.
  private readonly mapCanvas = document.createElement('canvas');
  // Textures are recreated per intro: GPU storage keeps its first size, and each wing's map differs.
  private mapTexture = pixelTexture(this.mapCanvas);
  private readonly mapMaterial = unlit({ map: this.mapTexture, transparent: true, depthWrite: false });
  private readonly mapMesh = new Mesh(new PlaneGeometry(1, 1), this.mapMaterial);
  // Flat 3D board: green caps riding on the wall tops, sandy floor overlay.
  private readonly capsCanvas = document.createElement('canvas');
  private capsTexture = pixelTexture(this.capsCanvas);
  // Caps and floor sit a hair above real surfaces: pull them forward in depth so they never z-fight.
  private readonly capsMaterial = unlit({
    map: this.capsTexture,
    alphaTest: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  private readonly capsMesh = new Mesh(new PlaneGeometry(1, 1), this.capsMaterial);
  private readonly floorMaterial = unlit({
    color: MAP_COLORS.floor,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly floorMesh = new Mesh(new PlaneGeometry(1, 1), this.floorMaterial);
  // Markers: a chunky red player token (like the map sprite) and a pulsing ring on the exit.
  private readonly tokenMaterial = unlit({ color: MAP_COLORS.player, transparent: true });
  private readonly tokenDarkMaterial = unlit({ color: 0x5a0f0f, transparent: true });
  private readonly tokenGeometry = new BoxGeometry(1, 1, 1);
  private readonly token = new Group();
  private readonly ringGeometry = new RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2);
  private readonly exitMaterial = unlit({ color: MAP_COLORS.exit, transparent: true, depthWrite: false, side: DoubleSide });
  private readonly exitRing = new Mesh(this.ringGeometry, this.exitMaterial);
  /** Flat "daylight" for the overview; always in the scene (constant light count), 0 when idle. */
  private readonly daylight = new AmbientLight(0xffffff, 0);

  private time = 0;
  private running = false;
  /** Playback speed (phones play it faster: they want to get going). */
  timeScale = 1;
  private readonly flattened: Object3D[] = [];
  private readonly flattenedScale: number[] = [];
  private wallHeight = 3;
  private cellSize = 1;
  private fogDensity = 0;
  private cameraFar = 150;
  private cameraNear = 0.05;
  private cameraFov = 72;
  private topHeight = 40;
  private readonly topPos = new Vector3();
  private readonly topTarget = new Vector3();
  private readonly endPos = new Vector3();
  private readonly endTarget = new Vector3();
  private readonly startDir = new Vector3();
  private readonly you = new Vector3();
  private readonly exit = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly up = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
  ) {
    this.root.name = 'intro';
    this.mapMesh.renderOrder = 10;
    this.exitRing.renderOrder = 11;
    const body = new Mesh(this.tokenGeometry, this.tokenMaterial);
    body.scale.set(0.46, 0.12, 0.3);
    body.position.y = 0.12;
    const cabin = new Mesh(this.tokenGeometry, this.tokenDarkMaterial);
    cabin.scale.set(0.22, 0.1, 0.24);
    cabin.position.set(-0.04, 0.23, 0);
    this.token.add(body, cabin);
    this.root.add(this.floorMesh, this.capsMesh, this.mapMesh, this.token, this.exitRing);
    scene.add(this.daylight);
  }

  get active(): boolean {
    return this.running;
  }

  /**
   * Call after the level is built: everything in the scene (except the camera) is flattened
   * into the map and regrown during the dive.
   * @param endPosition / endRotation the gameplay camera pose the intro lands on
   */
  begin(maze: MazeData, wallHeight: number, endPosition: Vector3, endRotation: Quaternion): void {
    this.end();
    this.running = true;
    this.time = 0;
    this.wallHeight = wallHeight;
    this.cellSize = maze.cellSize;
    for (const child of this.scene.children) {
      if (child === this.camera || child === this.daylight) continue;
      this.flattened.push(child);
      this.flattenedScale.push(child.scale.y);
    }

    const w = maze.width * maze.cellSize;
    const d = maze.height * maze.cellSize;
    const cellPx = Math.min(16, Math.floor(2048 / Math.max(maze.width, maze.height)));
    drawMazeMap(this.mapCanvas, maze, { cellPx });
    drawCaps(this.capsCanvas, maze, cellPx);
    this.mapTexture.dispose();
    this.capsTexture.dispose();
    this.mapTexture = pixelTexture(this.mapCanvas);
    this.capsTexture = pixelTexture(this.capsCanvas);
    this.mapMaterial.map = this.mapTexture;
    this.capsMaterial.map = this.capsTexture;
    for (const mesh of [this.mapMesh, this.capsMesh, this.floorMesh]) {
      mesh.geometry.dispose();
      mesh.geometry = new PlaneGeometry(w, d).rotateX(-Math.PI / 2);
      mesh.position.set(w / 2, 0, d / 2);
    }
    this.floorMesh.position.y = 0.01;

    this.you.set(maze.centerX(maze.startCell), 0, maze.centerZ(maze.startCell));
    this.exit.set(maze.centerX(maze.exitCell), 0, maze.centerZ(maze.exitCell));
    this.token.position.copy(this.you);
    this.exitRing.position.copy(this.exit);

    // Gameplay pose: where the dive ends, looking where the player looks.
    this.endPos.copy(endPosition);
    this.tmp.set(0, 0, -1).applyQuaternion(endRotation);
    this.endTarget.copy(endPosition).addScaledVector(this.tmp, 1.5);
    this.startDir.set(this.tmp.x, 0, this.tmp.z).normalize();
    this.token.rotation.y = Math.atan2(-this.startDir.z, this.startDir.x);

    // Overview: straight down over the centre, narrow lens, the maze filling 90% of the view.
    this.cameraFov = this.camera.fov;
    const half = Math.tan(MathUtils.degToRad(TOP_FOV / 2));
    this.topHeight = Math.max(d / 2 / half, w / 2 / (half * this.camera.aspect)) / 0.9;
    this.topTarget.set(w / 2, 0, d / 2);
    this.topPos.set(w / 2, this.topHeight, d / 2);

    const fog = this.scene.fog;
    this.fogDensity = fog instanceof FogExp2 ? fog.density : 0;
    this.cameraFar = this.camera.far;
    this.cameraNear = this.camera.near;
    this.camera.far = Math.max(INTRO_FAR, this.topHeight * 2);
    this.scene.add(this.root);
    this.apply();
  }

  /** @returns false once the intro has finished */
  update(dt: number): boolean {
    if (!this.running) return false;
    this.time += dt * this.timeScale;
    this.apply();
    return this.time < ZOOM_END;
  }

  /** Jumps to the end of the intro. */
  skip(): void {
    if (this.running) this.time = ZOOM_END;
  }

  /** Restores everything the intro changed and removes its meshes. */
  end(): void {
    if (!this.running) return;
    this.running = false;
    this.flattened.forEach((o, i) => (o.scale.y = this.flattenedScale[i]!));
    this.flattened.length = 0;
    this.flattenedScale.length = 0;
    const fog = this.scene.fog;
    if (fog instanceof FogExp2) fog.density = this.fogDensity;
    this.daylight.intensity = 0;
    this.camera.far = this.cameraFar;
    this.camera.near = this.cameraNear;
    this.camera.fov = this.cameraFov;
    this.camera.up.set(0, 1, 0);
    this.camera.updateProjectionMatrix();
    this.root.removeFromParent();
    this.overlay.titleAlpha = 0;
    this.overlay.labelAlpha = 0;
    this.overlay.fadeAlpha = 0;
  }

  private apply(): void {
    const t = this.time;
    const e = easeInOut(remap(t, XFADE, ZOOM_END));
    /** 0 = flat overview, 1 = inside the lab. */
    const inside = smooth(remap(e, 0.55, 0.95));

    // Painted map → flat 3D board.
    const mapAlpha = 1 - remap(t, HOLD, XFADE);
    this.mapMaterial.opacity = mapAlpha;
    this.mapMesh.visible = mapAlpha > 0.001;

    // Walls rise; the caps ride on top and darken, the sandy floor fades out.
    const grow = smooth(remap(e, 0.15, 0.7));
    const scale = FLAT_SCALE + (1 - FLAT_SCALE) * grow;
    this.flattened.forEach((o, i) => (o.scale.y = this.flattenedScale[i]! * scale));
    const top = this.wallHeight * scale;
    this.capsMesh.position.y = top + 0.01;
    this.mapMesh.position.y = top + 0.02;
    this.capsMaterial.color.set(MAP_COLORS.wall).lerp(TOP_INSIDE, smooth(remap(e, 0.35, 0.75)));
    const floorAlpha = 1 - smooth(remap(e, 0.35, 0.7));
    this.floorMaterial.opacity = floorAlpha;
    this.floorMesh.visible = floorAlpha > 0.002;

    // Player token: big on the map, shrinking to size, gone as the camera dives into it.
    const tokenAlpha = 1 - smooth(remap(e, 0.6, 0.8));
    this.tokenMaterial.opacity = this.tokenDarkMaterial.opacity = tokenAlpha;
    this.token.visible = tokenAlpha > 0.01 && mapAlpha < 1;
    this.token.scale.setScalar(this.cellSize * (1 + 0.8 * (1 - smooth(remap(e, 0, 0.5)))));
    this.token.position.y = top;
    const pulse = 1 + 0.2 * Math.sin(t * 6);
    const labelAlpha = smooth(remap(t, 0.4, 1.0)) * (1 - smooth(remap(e, 0.3, 0.55)));
    this.exitRing.scale.setScalar(this.cellSize * 0.95 * pulse);
    this.exitRing.position.y = top + 0.03;
    this.exitMaterial.opacity = labelAlpha;
    this.exitRing.visible = labelAlpha > 0.001;

    // Light: flat daylight over the board, the lab's own darkness and fog inside.
    this.daylight.intensity = 1.4 * (1 - inside);
    const fog = this.scene.fog;
    if (fog instanceof FogExp2) fog.density = this.fogDensity * inside;

    // Camera: slide toward the player while the height drops exponentially; the view's "up"
    // turns from map-north to the walking direction, then to the sky; the lens widens.
    const cam = this.camera;
    cam.position.lerpVectors(this.topPos, this.endPos, smooth(remap(e, 0, 0.7)));
    cam.position.y = this.topHeight * Math.pow(this.endPos.y / this.topHeight, e);
    this.tmp.lerpVectors(this.topTarget, this.endTarget, smooth(remap(e, 0, 0.85)));
    this.up
      .set(0, 0, -1)
      .lerp(this.startDir, smooth(remap(e, 0, 0.5)))
      .lerp(this.tmp2.set(0, 1, 0), smooth(remap(e, 0.5, 0.95)))
      .normalize();
    cam.up.copy(this.up);
    cam.lookAt(this.tmp);
    cam.fov = MathUtils.lerp(TOP_FOV, this.cameraFov, smooth(remap(e, 0.3, 1)));
    // Depth precision: the near plane follows the camera height (back to normal on arrival).
    cam.near = Math.max(this.cameraNear, (cam.position.y - top) * 0.05);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    const o = this.overlay;
    o.fadeAlpha = 1 - remap(t, 0, FADE_IN);
    o.titleAlpha = smooth(remap(t, 0.3, 0.9)) * (1 - smooth(remap(t, XFADE - 0.4, XFADE + 0.6)));
    o.labelAlpha = labelAlpha;
    this.project(this.you, top, 'you');
    this.project(this.exit, top, 'exit');
  }

  private project(p: Vector3, y: number, which: 'you' | 'exit'): void {
    this.tmp.set(p.x, y, p.z).project(this.camera);
    const x = (this.tmp.x + 1) / 2;
    const sy = (1 - this.tmp.y) / 2;
    if (which === 'you') {
      this.overlay.youX = x;
      this.overlay.youY = sy;
    } else {
      this.overlay.exitX = x;
      this.overlay.exitY = sy;
    }
  }

  dispose(): void {
    this.end();
    this.daylight.removeFromParent();
    for (const mesh of [this.mapMesh, this.capsMesh, this.floorMesh]) mesh.geometry.dispose();
    this.tokenGeometry.dispose();
    this.ringGeometry.dispose();
    for (const tex of [this.mapTexture, this.capsTexture]) tex.dispose();
    for (const m of [
      this.mapMaterial,
      this.capsMaterial,
      this.floorMaterial,
      this.tokenMaterial,
      this.tokenDarkMaterial,
      this.exitMaterial,
    ]) {
      m.dispose();
    }
  }
}

function pixelTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function unlit(params: ConstructorParameters<typeof MeshBasicMaterial>[0]): MeshBasicMaterial {
  return new MeshBasicMaterial({ fog: false, toneMapped: false, ...params });
}

/** White wall cells on a transparent floor: the caps' mask (tinted by the material colour). */
function drawCaps(canvas: HTMLCanvasElement, maze: MazeData, cellPx: number): void {
  canvas.width = maze.width * cellPx;
  canvas.height = maze.height * cellPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (maze.isWall(x, y)) ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
    }
  }
}
