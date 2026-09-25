import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LootKind, MazeConfig } from '../config/types';

export const DOOR_HEIGHT = 2.6;
/** How far the door sits inside the dead-end cell, measured from the cell edge. */
export const DOOR_INSET = 0.4;

const AMBER = '#ffb030';

/** Sign text and colour above each kind of room's door. */
export const ROOM_LABELS: Readonly<Record<LootKind, { readonly text: string; readonly color: string }>> = {
  weapons: { text: 'ARMORY', color: AMBER },
  nullifier: { text: 'EMP LAB', color: '#c07bff' },
  keycard: { text: 'SECURITY', color: '#4dff88' },
};

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  return [c, ctx];
}

function texture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function hazard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stripe: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#16140f';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#d9a400';
  for (let i = -h; i < w + h; i += stripe * 2) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + stripe, y + h);
    ctx.lineTo(x + i + stripe + h, y);
    ctx.lineTo(x + i + h, y);
    ctx.fill();
  }
  ctx.restore();
}

/** Crossed hammer + grenade stencil, centred on (cx, cy). */
function emblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.stroke();
  // Hammer
  ctx.save();
  ctx.rotate(-0.6);
  ctx.fillRect(-3, -14, 6, 36);
  ctx.fillRect(-13, -22, 26, 10);
  ctx.restore();
  // Grenade
  ctx.beginPath();
  ctx.ellipse(10, 6, 9, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(6, -9, 8, 5);
  ctx.restore();
}

/** Steel sliding door in the spirit of Wolfenstein 3D: riveted plates, hazard band, handle slot. */
function doorColor(): HTMLCanvasElement {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#6a7a8a');
  g.addColorStop(1, '#3f4b58');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // Frame
  ctx.strokeStyle = '#262d35';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, 244, 244);
  // Two recessed vertical plates
  for (const x of [22, 136]) {
    ctx.fillStyle = '#4b5967';
    ctx.fillRect(x, 20, 98, 124);
    ctx.fillRect(x, 186, 98, 50);
    ctx.fillStyle = '#7d8d9c';
    ctx.fillRect(x, 20, 98, 2);
    ctx.fillRect(x, 186, 98, 2);
    ctx.fillStyle = '#2f3740';
    ctx.fillRect(x, 142, 98, 2);
    ctx.fillRect(x, 234, 98, 2);
  }
  hazard(ctx, 12, 150, 232, 30, 12);
  // Rivets
  ctx.fillStyle = '#9aa7b3';
  for (let i = 18; i < 250; i += 26) {
    for (const [x, y] of [[i, 15], [i, 241], [15, i], [241, i]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Handle slot on the sliding edge
  ctx.fillStyle = '#15191e';
  ctx.fillRect(222, 70, 10, 50);
  emblem(ctx, 128, 82, '#20262d');
  return c;
}

function doorEmissive(): HTMLCanvasElement {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  emblem(ctx, 128, 82, AMBER);
  ctx.fillStyle = 'rgba(255,176,48,0.5)';
  ctx.fillRect(12, 148, 232, 2);
  ctx.fillRect(12, 180, 232, 2);
  return c;
}

function jambColor(): HTMLCanvasElement {
  const [c, ctx] = canvas(32, 256);
  hazard(ctx, 0, 0, 32, 256, 10);
  return c;
}

function signColor(text: string, color: string): HTMLCanvasElement {
  const [c, ctx] = canvas(256, 64);
  ctx.fillStyle = '#050403';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.font = 'bold 34px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  return c;
}

/** Geometry, textures and materials shared by every armory (sized from the maze config). */
export class ArmoryAssets {
  readonly doorMaterial: MeshStandardMaterial;
  readonly jambMaterial: MeshStandardMaterial;
  readonly frameMaterial = new MeshStandardMaterial({ color: 0x2a3038, metalness: 0.6, roughness: 0.5 });
  readonly signMaterials: Record<LootKind, MeshBasicMaterial>;
  /** Robot nullifier: a pulsing violet EMP emitter. */
  readonly nullifierGlow = new MeshBasicMaterial({ color: 0xb46bff, toneMapped: false });
  /** Exit keycard. */
  readonly keycardMaterial = new MeshStandardMaterial({ color: 0x1d3a2a, emissive: 0x4dff88, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.4 });
  readonly keycardStripe = new MeshBasicMaterial({ color: 0xe8fff0, toneMapped: false });
  readonly crateMaterial = new MeshStandardMaterial({ color: 0x3a4526, metalness: 0.3, roughness: 0.7, emissive: 0x070904 });
  readonly stripOn = new MeshBasicMaterial({ color: 0xffb030, toneMapped: false });
  readonly stripOff = new MeshBasicMaterial({ color: 0x2a2418 });
  /** Pulsing outline on doors that can still be opened (see ArmoryManager.update). */
  readonly highlightMaterial = new MeshBasicMaterial({
    color: 0xffc23a,
    transparent: true,
    opacity: 0.8,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  readonly ringMaterial = new MeshBasicMaterial({
    color: 0xffb030,
    transparent: true,
    opacity: 0.5,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
  });

  readonly door: BoxGeometry;
  readonly jamb: BoxGeometry;
  readonly lintel: BoxGeometry;
  /** Glowing frame just in front of the door panel plus a light strip on the floor. */
  readonly highlight: BufferGeometry;
  readonly sign = new PlaneGeometry(1.3, 0.32);
  readonly lamp = new BoxGeometry(0.09, 0.09, 0.03);
  readonly crate = new BoxGeometry(0.9, 0.5, 0.6);
  readonly strip = new BoxGeometry(0.92, 0.05, 0.62);
  readonly ring = new RingGeometry(0.62, 0.72, 32);
  readonly deviceBase = new CylinderGeometry(0.14, 0.17, 0.12, 16);
  readonly deviceCore = new SphereGeometry(0.08, 14, 10);
  readonly deviceRing = new TorusGeometry(0.15, 0.018, 8, 24);
  readonly keycard = new BoxGeometry(0.26, 0.16, 0.015);
  readonly keycardBand = new BoxGeometry(0.26, 0.03, 0.017);

  private readonly textures: CanvasTexture[];
  private readonly geometries: BufferGeometry[];

  constructor(readonly maze: MazeConfig) {
    const s = maze.cellSize;
    const doorMap = texture(doorColor());
    const doorGlow = texture(doorEmissive());
    const jambMap = texture(jambColor());
    const signMaps = {
      weapons: texture(signColor(ROOM_LABELS.weapons.text, ROOM_LABELS.weapons.color)),
      nullifier: texture(signColor(ROOM_LABELS.nullifier.text, ROOM_LABELS.nullifier.color)),
      keycard: texture(signColor(ROOM_LABELS.keycard.text, ROOM_LABELS.keycard.color)),
    };
    this.textures = [doorMap, doorGlow, jambMap, ...Object.values(signMaps)];

    this.doorMaterial = new MeshStandardMaterial({
      map: doorMap,
      emissiveMap: doorGlow,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      metalness: 0.5,
      roughness: 0.45,
    });
    this.jambMaterial = new MeshStandardMaterial({
      map: jambMap,
      emissiveMap: jambMap,
      emissive: 0x3a2800,
      metalness: 0.4,
      roughness: 0.6,
    });
    this.signMaterials = {
      weapons: new MeshBasicMaterial({ map: signMaps.weapons, toneMapped: false }),
      nullifier: new MeshBasicMaterial({ map: signMaps.nullifier, toneMapped: false }),
      keycard: new MeshBasicMaterial({ map: signMaps.keycard, toneMapped: false }),
    };

    this.door = new BoxGeometry(s - 0.08, DOOR_HEIGHT, 0.14);
    this.jamb = new BoxGeometry(0.16, DOOR_HEIGHT, 0.46);
    this.lintel = new BoxGeometry(s, maze.wallHeight - DOOR_HEIGHT, 0.46);
    const edge = s / 2 - 0.15;
    const bars = [
      new BoxGeometry(s - 0.3, 0.06, 0.02).translate(0, DOOR_HEIGHT - 0.05, 0.085),
      new BoxGeometry(0.06, DOOR_HEIGHT - 0.1, 0.02).translate(-edge, DOOR_HEIGHT / 2, 0.085),
      new BoxGeometry(0.06, DOOR_HEIGHT - 0.1, 0.02).translate(edge, DOOR_HEIGHT / 2, 0.085),
      new PlaneGeometry(s - 0.3, 0.3).rotateX(-Math.PI / 2).translate(0, 0.015, 0.45),
    ].map((g) => (g.index ? g.toNonIndexed() : g));
    this.highlight = mergeGeometries(bars, false)!;
    for (const g of bars) g.dispose();
    this.geometries = [
      this.highlight,
      this.door,
      this.jamb,
      this.lintel,
      this.sign,
      this.lamp,
      this.crate,
      this.strip,
      this.ring,
      this.deviceBase,
      this.deviceCore,
      this.deviceRing,
      this.keycard,
      this.keycardBand,
    ];
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const t of this.textures) t.dispose();
    for (const m of [
      this.doorMaterial,
      this.jambMaterial,
      this.frameMaterial,
      ...Object.values(this.signMaterials),
      this.nullifierGlow,
      this.keycardMaterial,
      this.keycardStripe,
      this.crateMaterial,
      this.stripOn,
      this.stripOff,
      this.ringMaterial,
      this.highlightMaterial,
    ]) {
      m.dispose();
    }
  }
}
