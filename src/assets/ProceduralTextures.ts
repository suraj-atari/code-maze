import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { Random } from '../utils/Random';

export const TextureKeys = {
  Wall: 'wall',
  WallEmissive: 'wall-emissive',
  WallGlass: 'wall-glass',
  Floor: 'floor',
  Ceiling: 'ceiling',
  CeilingEmissive: 'ceiling-emissive',
} as const;

const SIZE = 256;

function makeCanvas(width = SIZE, height = SIZE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas not supported');
  return [canvas, ctx];
}

function speckle(ctx: CanvasRenderingContext2D, rng: Random, count: number, alpha: number, w = SIZE, h = SIZE): void {
  for (let i = 0; i < count; i++) {
    const v = rng.next() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rng.next()})`;
    ctx.fillRect(rng.int(w), rng.int(h), 1 + rng.int(2), 1 + rng.int(2));
  }
}

function toTexture(canvas: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.anisotropy = anisotropy;
  return tex;
}

// A wall face is 2.6 m × 3.2 m, so the wall maps use the same aspect ratio.
const WALL_W = 256;
const WALL_H = 320;
// Lab wall layout (shared by the colour, emissive and glass maps): an upper panel holding a
// glass window, a row of lower cabinet doors, and a service pillar with light slots.
const CAB = { x: 34, y: 70, w: 120, h: 118 };
const PILLAR = { x: 196, w: 48 };
const SLOTS = [80, 118, 156, 194, 232] as const;
const LOWER = { y: 212, h: 72 };

/**
 * Sci-fi lab wall panelling (cabinets, window, pillar with light slots, pipe baseboard).
 * The window pane has alpha < 0.5: the wall material cuts it out (alphaTest) and a glass layer
 * (see `wallGlass`) is drawn there instead. Its colour is a dark tint, for opaque uses of the map.
 */
function wallColor(rng: Random): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(WALL_W, WALL_H);
  ctx.fillStyle = '#5b6c70';
  ctx.fillRect(0, 0, WALL_W, WALL_H);
  speckle(ctx, rng, 3500, 0.07, WALL_W, WALL_H);

  // Seams between neighbouring wall faces.
  ctx.fillStyle = '#263033';
  ctx.fillRect(0, 0, 4, WALL_H);
  ctx.fillRect(WALL_W - 4, 0, 4, WALL_H);

  // Header: dark trim with a thin panel line.
  ctx.fillStyle = '#3c494d';
  ctx.fillRect(0, 0, WALL_W, 40);
  ctx.fillStyle = '#718286';
  ctx.fillRect(0, 38, WALL_W, 2);
  ctx.fillStyle = '#2e393c';
  ctx.fillRect(12, 14, 150, 3);

  // Upper panel framing the server cabinet.
  ctx.fillStyle = '#6a7c80';
  ctx.fillRect(12, 50, 176, 152);
  ctx.strokeStyle = '#3a474a';
  ctx.lineWidth = 2;
  ctx.strokeRect(13, 51, 174, 150);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(14, 52, 172, 3);

  // Window with a riveted frame; the pane itself is (almost) transparent.
  ctx.fillStyle = '#141a1c';
  ctx.fillRect(CAB.x - 8, CAB.y - 8, CAB.w + 16, CAB.h + 16);
  ctx.clearRect(CAB.x, CAB.y, CAB.w, CAB.h);
  ctx.fillStyle = 'rgba(38, 62, 70, 0.3)';
  ctx.fillRect(CAB.x, CAB.y, CAB.w, CAB.h);
  ctx.fillStyle = '#56666a';
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    for (const [x, y] of [
      [CAB.x - 4 + t * (CAB.w + 8), CAB.y - 4],
      [CAB.x - 4 + t * (CAB.w + 8), CAB.y + CAB.h + 4],
      [CAB.x - 4, CAB.y - 4 + t * (CAB.h + 8)],
      [CAB.x + CAB.w + 4, CAB.y - 4 + t * (CAB.h + 8)],
    ] as const) {
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  // Lower cabinet doors with handles.
  const doorW = 176 / 3;
  for (let i = 0; i < 3; i++) {
    const x = 12 + i * doorW;
    ctx.fillStyle = i === 1 ? '#61737a' : '#66787c';
    ctx.fillRect(x + 2, LOWER.y, doorW - 4, LOWER.h);
    ctx.strokeStyle = '#34403f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, LOWER.y + 1, doorW - 6, LOWER.h - 2);
    ctx.fillStyle = '#2b3437';
    ctx.fillRect(x + doorW / 2 - 8, LOWER.y + 10, 16, 3);
  }

  // Service pillar with a column of light slots.
  ctx.fillStyle = '#44545a';
  ctx.fillRect(PILLAR.x, 40, PILLAR.w, 250);
  ctx.fillStyle = '#34424a';
  ctx.fillRect(PILLAR.x, 40, 4, 250);
  ctx.fillRect(PILLAR.x + PILLAR.w - 4, 40, 4, 250);
  ctx.fillStyle = '#171d20';
  for (const y of SLOTS) ctx.fillRect(PILLAR.x + 18, y - 12, 12, 24);

  // Baseboard: kick plate, pipe, and the channel for the dim yellow floor strip.
  ctx.fillStyle = '#343f42';
  ctx.fillRect(0, 290, WALL_W, 30);
  const pipe = ctx.createLinearGradient(0, 296, 0, 310);
  pipe.addColorStop(0, '#7b8b8c');
  pipe.addColorStop(0.5, '#444f51');
  pipe.addColorStop(1, '#1f2628');
  ctx.fillStyle = pipe;
  ctx.fillRect(0, 296, WALL_W, 14);
  ctx.fillStyle = '#12171a';
  ctx.fillRect(0, 312, WALL_W, 6);
  return c;
}

/** Coloured glow for the lab wall (the wall material's emissive colour is white). */
function wallEmissive(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(WALL_W, WALL_H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WALL_W, WALL_H);
  // Dim yellow pillar slots.
  ctx.fillStyle = '#6e5518';
  for (const y of SLOTS) ctx.fillRect(PILLAR.x + 20, y - 10, 8, 20);
  // Dim yellow floor strip.
  ctx.fillStyle = '#7a5f1a';
  ctx.fillRect(0, 313, WALL_W, 4);
  return c;
}

/**
 * Opacity (alpha map, green channel) of the glass layer: faint inside the window with a few
 * brighter diagonal streaks so the pane reads as glass; zero everywhere else.
 */
function wallGlass(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(WALL_W, WALL_H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WALL_W, WALL_H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(CAB.x, CAB.y, CAB.w, CAB.h);
  ctx.clip();
  ctx.fillStyle = 'rgb(44, 44, 44)';
  ctx.fillRect(CAB.x, CAB.y, CAB.w, CAB.h);
  ctx.fillStyle = 'rgb(96, 96, 96)';
  for (const [offset, width] of [[10, 16], [38, 5], [78, 10]] as const) {
    ctx.beginPath();
    ctx.moveTo(CAB.x + offset, CAB.y + CAB.h);
    ctx.lineTo(CAB.x + offset + width, CAB.y + CAB.h);
    ctx.lineTo(CAB.x + offset + width + CAB.h * 0.6, CAB.y);
    ctx.lineTo(CAB.x + offset + CAB.h * 0.6, CAB.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  return c;
}

/**
 * Corridor floor tile (one per cell): a cross of dark grating through the centre, so runs of
 * cells read as a grated walkway in either direction, with lighter vented deck plates in the corners.
 */
function floorColor(rng: Random): HTMLCanvasElement {
  const [c, ctx] = makeCanvas();
  const a = 72;
  const b = SIZE - a;
  ctx.fillStyle = '#1a2022';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Grating bars forming square holes.
  ctx.fillStyle = '#4c5a5a';
  for (let i = 0; i <= SIZE; i += 14) {
    ctx.fillRect(i, 0, 4, SIZE);
    ctx.fillRect(0, i, SIZE, 4);
  }

  // Deck plates in the four corners.
  const w = a - 4;
  for (const [px, py] of [[0, 0], [b + 4, 0], [0, b + 4], [b + 4, b + 4]] as const) {
    ctx.fillStyle = '#7b8c88';
    ctx.fillRect(px, py, w, w);
    ctx.strokeStyle = '#2a3235';
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 1.5, py + 1.5, w - 3, w - 3);
    ctx.fillStyle = '#95a6a1';
    ctx.fillRect(px + 4, py + 4, w - 8, 2);
    ctx.fillStyle = '#262e31';
    for (let i = 0; i < 4; i++) ctx.fillRect(px + 14 + i * 11, py + 22, 5, w - 44);
  }
  // Rails framing the grating.
  ctx.fillStyle = '#3a4548';
  for (const x of [a - 2, b - 2]) {
    ctx.fillRect(x, 0, 4, a);
    ctx.fillRect(x, b, 4, a);
  }
  for (const y of [a - 2, b - 2]) {
    ctx.fillRect(0, y, a, 4);
    ctx.fillRect(b, y, a, 4);
  }
  speckle(ctx, rng, 3500, 0.12);
  return c;
}

/** Fluorescent light panel in the middle of each ceiling tile. */
const CEIL_LIGHT = { x: 78, y: 112, w: 100, h: 32 };

/** Ceiling: pale panelled tiles with vent dots and a small red marker. */
function ceilingColor(rng: Random): HTMLCanvasElement {
  const [c, ctx] = makeCanvas();
  ctx.fillStyle = '#3c4549';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const rows = 4;
  const h = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    for (const [x, w] of [[6, 110], [122, 128]] as const) {
      ctx.fillStyle = r % 2 ? '#8a9699' : '#97a3a5';
      ctx.fillRect(x, r * h + 5, w, h - 10);
      ctx.fillStyle = '#394145';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 12 + i * 10, r * h + 18, 4, 4);
    }
  }
  ctx.fillStyle = '#8a1f1f';
  ctx.beginPath();
  ctx.moveTo(180, 100);
  ctx.lineTo(196, 100);
  ctx.lineTo(188, 108);
  ctx.fill();
  // Housing for the fluorescent light panel (lit by ceilingEmissive).
  ctx.fillStyle = '#2a3134';
  ctx.fillRect(CEIL_LIGHT.x - 6, CEIL_LIGHT.y - 6, CEIL_LIGHT.w + 12, CEIL_LIGHT.h + 12);
  ctx.fillStyle = '#e8f2ee';
  ctx.fillRect(CEIL_LIGHT.x, CEIL_LIGHT.y, CEIL_LIGHT.w, CEIL_LIGHT.h);
  speckle(ctx, rng, 1500, 0.08);
  return c;
}

/** Glow of the ceiling's fluorescent panel: cool white with a soft falloff. */
function ceilingEmissive(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = 'rgba(200,235,225,0.25)';
  ctx.fillRect(CEIL_LIGHT.x - 6, CEIL_LIGHT.y - 6, CEIL_LIGHT.w + 12, CEIL_LIGHT.h + 12);
  ctx.fillStyle = '#d8f2ea';
  ctx.fillRect(CEIL_LIGHT.x, CEIL_LIGHT.y, CEIL_LIGHT.w, CEIL_LIGHT.h);
  return c;
}

/** Generates all procedural surface textures (once, at load time). */
export function createProceduralTextures(anisotropy: number): Record<string, CanvasTexture> {
  const rng = new Random(1337);
  return {
    [TextureKeys.Wall]: toTexture(wallColor(rng), anisotropy),
    [TextureKeys.WallEmissive]: toTexture(wallEmissive(), anisotropy),
    [TextureKeys.WallGlass]: toTexture(wallGlass(), anisotropy),
    [TextureKeys.Floor]: toTexture(floorColor(rng), anisotropy),
    [TextureKeys.Ceiling]: toTexture(ceilingColor(rng), anisotropy),
    [TextureKeys.CeilingEmissive]: toTexture(ceilingEmissive(), anisotropy),
  };
}
