/** Most radar blips drawn at once. */
export const MAX_BLIPS = 24;

/**
 * What the compass shows. Directions are compass bearings in radians, clockwise from north
 * (north = world -Z, the top of the intro map). Blips are in metres in the player's frame
 * (x = right, y = forward). The object is reused by the producer.
 */
export interface CompassModel {
  heading: number;
  /** Straight-line bearing to the current goal (not the path: the maze stays a mystery). */
  targetBearing: number;
  targetDistance: number;
  targetLabel: string;
  /** Radar range in metres (the rim). */
  range: number;
  blipCount: number;
  readonly blips: Float32Array;
  /** 0..1 per blip: how fresh the last ping is (fades between sweeps). */
  readonly blipAlpha: Float32Array;
  /** Per blip: 0 = calm, 1 = hunting you, 2 = paralysed. */
  readonly blipKind: Uint8Array;
  /** 0..1 position of the cosmetic sweep line. */
  sweep: number;
}

export function createCompassModel(): CompassModel {
  return {
    heading: 0,
    targetBearing: 0,
    targetDistance: 0,
    targetLabel: 'EXIT',
    range: 26,
    blipCount: 0,
    blips: new Float32Array(MAX_BLIPS * 2),
    blipAlpha: new Float32Array(MAX_BLIPS),
    blipKind: new Uint8Array(MAX_BLIPS),
    sweep: 0,
  };
}

const TAU = Math.PI * 2;
const TARGET = '#ffb02e';
/** Blip colours by kind; fading uses globalAlpha, so no colour strings are built per frame. */
const BLIP_COLORS = ['rgb(255, 176, 46)', 'rgb(255, 48, 64)', 'rgb(166, 107, 255)'] as const;

/**
 * Heading-up compass radar: the ring (N, ticks) turns with the player, whose arrow always
 * points up; an orange marker on the rim points at the goal, with bearing and distance below.
 * Robot blips come from periodic radar pings, so they show where a robot *was* a moment ago.
 * Drawn on a small 2D canvas every frame (cheap); the label only updates when its text changes.
 */
export class Compass {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly labelName: HTMLElement;
  private readonly labelValue: HTMLElement;
  private lastLabel = '';
  private cssSize = 0;
  private font = '';
  private lastDeg = -1;
  private lastMeters = -1;
  private lastDraw = 0;

  /** @param minInterval seconds between redraws (phones redraw at ~30 Hz) */
  constructor(
    root: HTMLElement,
    private readonly minInterval = 0,
  ) {
    this.canvas = root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d');
    this.labelName = root.querySelector('.compass-name')!;
    this.labelValue = root.querySelector('.compass-value')!;
  }

  update(m: Readonly<CompassModel>): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.updateLabel(m);
    if (this.minInterval > 0) {
      const now = performance.now();
      if (now - this.lastDraw < this.minInterval * 1000) return;
      this.lastDraw = now;
    }
    this.fit();
    const S = this.cssSize;
    const c = S / 2;
    const R = c - 4;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const dpr = this.canvas.width / S;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Dial.
    ctx.fillStyle = 'rgba(8, 14, 18, 0.72)';
    ctx.strokeStyle = 'rgba(150, 205, 220, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150, 205, 220, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c, c, R * 0.62, 0, TAU);
    ctx.stroke();

    // Cosmetic sweep: a faint wedge trailing the line that refreshes the blips.
    const sweepA = m.sweep * TAU - Math.PI / 2;
    ctx.fillStyle = 'rgba(47, 216, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, R - 1, sweepA - 0.7, sweepA);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(47, 216, 255, 0.35)';
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(sweepA) * (R - 1), c + Math.sin(sweepA) * (R - 1));
    ctx.stroke();

    // Ticks and cardinal letters rotate against the heading.
    const rot = -m.heading;
    ctx.strokeStyle = 'rgba(200, 230, 240, 0.6)';
    for (let i = 0; i < 12; i++) {
      const a = rot + (i / 12) * TAU;
      const inner = i % 3 === 0 ? R - 11 : R - 7;
      ctx.lineWidth = i % 3 === 0 ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(c + Math.sin(a) * inner, c - Math.cos(a) * inner);
      ctx.lineTo(c + Math.sin(a) * (R - 2), c - Math.cos(a) * (R - 2));
      ctx.stroke();
    }
    ctx.font = this.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = ['N', 'E', 'S', 'W'] as const;
    for (let i = 0; i < 4; i++) {
      const a = rot + (i / 4) * TAU;
      const r = R - 20;
      ctx.fillStyle = i === 0 ? '#ffffff' : 'rgba(200, 230, 240, 0.45)';
      ctx.fillText(letters[i]!, c + Math.sin(a) * r, c - Math.cos(a) * r);
    }

    // Robot blips (last ping), clamped inside the dial.
    const scale = (R - 8) / m.range;
    for (let i = 0; i < m.blipCount; i++) {
      const alpha = m.blipAlpha[i]!;
      if (alpha <= 0.02) continue;
      const x = m.blips[i * 2]! * scale;
      const y = m.blips[i * 2 + 1]! * scale;
      if (x * x + y * y > (R - 6) * (R - 6)) continue;
      ctx.fillStyle = BLIP_COLORS[m.blipKind[i]!] ?? BLIP_COLORS[0];
      ctx.globalAlpha = 0.25 * alpha;
      ctx.beginPath();
      ctx.arc(c + x, c - y, 7, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(c + x, c - y, 3.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Goal direction: dashed line to a marker on the rim.
    const t = m.targetBearing - m.heading;
    const tx = Math.sin(t);
    const ty = -Math.cos(t);
    ctx.strokeStyle = TARGET;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(c + tx * 14, c + ty * 14);
    ctx.lineTo(c + tx * (R - 16), c + ty * (R - 16));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(c + tx * (R - 10), c + ty * (R - 10));
    ctx.rotate(t);
    ctx.fillStyle = TARGET;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(8, 6);
    ctx.lineTo(-8, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // The player: always pointing up.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(c, c - 13);
    ctx.lineTo(c + 9, c + 10);
    ctx.lineTo(c, c + 5);
    ctx.lineTo(c - 9, c + 10);
    ctx.closePath();
    ctx.fill();

  }

  /** Bearing / distance text: rebuilt only when the rounded numbers change. */
  private updateLabel(m: Readonly<CompassModel>): void {
    if (m.targetLabel !== this.lastLabel) {
      this.lastLabel = m.targetLabel;
      this.labelName.textContent = m.targetLabel;
    }
    const deg = Math.round(((m.targetBearing * 180) / Math.PI + 360) % 360) % 360;
    const meters = Math.round(m.targetDistance);
    if (deg === this.lastDeg && meters === this.lastMeters) return;
    this.lastDeg = deg;
    this.lastMeters = meters;
    this.labelValue.innerHTML = `<b>${String(deg).padStart(3, '0')}°</b> · ${meters} m`;
  }

  /** Keeps the backing store matched to the CSS size and pixel ratio. */
  private fit(): void {
    const size = this.canvas.clientWidth || 150;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * dpr);
    if (this.canvas.width !== px || this.cssSize !== size) {
      this.canvas.width = px;
      this.canvas.height = px;
      this.font = `bold ${Math.round(size * 0.085)}px ${getComputedStyle(this.canvas).fontFamily}`;
    }
    this.cssSize = size;
  }
}
