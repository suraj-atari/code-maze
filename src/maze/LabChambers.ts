import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Random } from '../utils/Random';
import type { MazeData } from './MazeData';

/** One wall cell turned into a glass-fronted lab chamber. */
export interface Chamber {
  readonly index: number;
  /** Yaw that turns the chamber's front (+Z) toward an open corridor. */
  readonly yaw: number;
  readonly variant: number;
}

type MatKey = 'frame' | 'panel' | 'skin' | 'glass' | 'liquid' | 'haze' | 'cyan' | 'warm' | 'red' | 'screen';
type Parts = Partial<Record<MatKey, BufferGeometry[]>>;

const VARIANTS = 3;
/** Minimum spacing (cells, Chebyshev distance) between chambers: 2 = never touching. */
const SPACING = 2;
const MAX_CHAMBERS = 40;
/** Roughly one chamber per this many floor cells, so most corridors pass an observation window. */
const FLOOR_CELLS_PER_CHAMBER = 9;
/** Heights of the solid sill below and the header above each window. */
const SILL_H = 0.5;
const HEADER_H = 0.35;

/**
 * Picks wall cells that become lab chambers. Deterministic per maze, and it does not consume
 * the level's RNG, so robot/armory placement is unchanged. Chambers stay walls for physics and AI.
 */
export function pickChambers(maze: MazeData): Chamber[] {
  const rng = new Random((maze.startCell * 7919) ^ (maze.exitCell * 104729) ^ (maze.width << 8) ^ maze.height);
  const candidates: number[] = [];
  let floors = 0;
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (!maze.isWall(x, y)) {
        floors++;
        continue;
      }
      if (x < 1 || y < 1 || x > maze.width - 2 || y > maze.height - 2) continue;
      if (maze.openNeighbours(maze.index(x, y)) > 0) candidates.push(maze.index(x, y));
    }
  }
  rng.shuffle(candidates);

  const target = Math.min(MAX_CHAMBERS, Math.max(2, Math.floor(floors / FLOOR_CELLS_PER_CHAMBER)));
  const chambers: Chamber[] = [];
  for (const index of candidates) {
    if (chambers.length >= target) break;
    const x = maze.cellX(index);
    const y = maze.cellY(index);
    const tooClose = chambers.some(
      (c) => Math.max(Math.abs(maze.cellX(c.index) - x), Math.abs(maze.cellY(c.index) - y)) < SPACING,
    );
    if (tooClose) continue;
    // Face the first open neighbour (+Z local → that direction).
    const dirs = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ] as const;
    const open = dirs.filter(([dx, dy]) => !maze.isWall(x + dx, y + dy));
    const [dx, dy] = open[rng.int(open.length)]!;
    chambers.push({ index, yaw: Math.atan2(dx, dy), variant: rng.int(VARIANTS) });
  }
  return chambers;
}

/**
 * Visuals of the lab chambers: big observation windows on every side, a lit ceiling panel with a
 * hazy light shaft, and inside either an experiment on a human test subject (variant 0: stasis
 * tube, variant 1: operating table) or a server bay (variant 2).
 * Geometry is merged per (variant, material) and drawn instanced across all chambers of that
 * variant, so the whole set costs about a dozen draw calls.
 */
export class LabChambers {
  readonly root = new Group();
  private readonly materials: Record<MatKey, Material>;
  private readonly geometries: BufferGeometry[] = [];
  private readonly meshes: InstancedMesh[] = [];

  constructor(maze: MazeData, chambers: readonly Chamber[], cellSize: number, wallHeight: number) {
    this.root.name = 'lab-chambers';
    this.materials = {
      frame: new MeshStandardMaterial({ color: 0x2b3438, metalness: 0.5, roughness: 0.45 }),
      panel: new MeshStandardMaterial({ color: 0x9aa8ab, metalness: 0.2, roughness: 0.6 }),
      skin: new MeshStandardMaterial({ color: 0xc7a08c, roughness: 0.7, emissive: 0x1d2e26 }),
      glass: new MeshStandardMaterial({
        color: 0x9fd8e0,
        metalness: 0.3,
        roughness: 0.05,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: DoubleSide,
      }),
      liquid: new MeshBasicMaterial({ color: 0x2dff9a, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
      haze: new MeshBasicMaterial({
        color: 0xcfe9ff,
        transparent: true,
        opacity: 0.06,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
      cyan: new MeshBasicMaterial({ color: 0x5fe8ff, toneMapped: false }),
      warm: new MeshBasicMaterial({ color: 0xfff0cf, toneMapped: false }),
      red: new MeshBasicMaterial({ color: 0xff3b30, toneMapped: false }),
      screen: new MeshBasicMaterial({ color: 0x4dff88, toneMapped: false }),
    };
    if (chambers.length === 0) return;

    const m = new Matrix4();
    for (let v = 0; v < VARIANTS; v++) {
      const list = chambers.filter((c) => c.variant === v);
      if (list.length === 0) continue;
      const parts = this.frameParts(cellSize, wallHeight);
      if (v === 0) this.stasisTube(parts, wallHeight);
      else if (v === 1) this.operatingTable(parts, wallHeight);
      else this.serverBay(parts, wallHeight);

      for (const key of Object.keys(parts) as MatKey[]) {
        const geo = merge(parts[key]!);
        this.geometries.push(geo);
        const mesh = new InstancedMesh(geo, this.materials[key], list.length);
        mesh.name = `chamber-${v}-${key}`;
        // Liquid is drawn before the glass that surrounds it, the light haze last.
        mesh.renderOrder = key === 'liquid' ? 1 : key === 'glass' ? 2 : key === 'haze' ? 3 : 0;
        list.forEach((c, i) => {
          m.makeRotationY(c.yaw).setPosition(maze.centerX(c.index), 0, maze.centerZ(c.index));
          mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
        this.meshes.push(mesh);
        this.root.add(mesh);
      }
    }
  }

  get drawCallEstimate(): number {
    return this.meshes.length;
  }

  // ------------------------------------------------------------------ chamber shell

  /** Floor plate, ceiling light + haze, corner posts, and on every side: sill, header, glass, strip. */
  private frameParts(s: number, h: number): Parts {
    const p: Parts = {};
    const d = s / 2 - 0.08;
    const glassH = h - SILL_H - HEADER_H;
    const glassY = SILL_H + glassH / 2;
    add(p, 'panel', new BoxGeometry(s - 0.1, 0.03, s - 0.1).translate(0, 0.015, 0));
    add(p, 'warm', new BoxGeometry(1.0, 0.03, 0.5).translate(0, h - 0.03, 0));
    add(p, 'haze', new CylinderGeometry(0.45, 1.05, h - 0.05, 16, 1, true).translate(0, (h - 0.05) / 2, 0));
    for (const [x, z] of [[d, d], [-d, d], [d, -d], [-d, -d]] as const) {
      add(p, 'frame', new BoxGeometry(0.14, h, 0.14).translate(x, h / 2, z));
    }
    for (let side = 0; side < 4; side++) {
      const yaw = (side * Math.PI) / 2;
      add(p, 'frame', new BoxGeometry(s, SILL_H, 0.12).translate(0, SILL_H / 2, d).rotateY(yaw));
      add(p, 'panel', new BoxGeometry(s - 0.2, 0.05, 0.18).translate(0, SILL_H + 0.02, d).rotateY(yaw));
      add(p, 'frame', new BoxGeometry(s, HEADER_H, 0.12).translate(0, h - HEADER_H / 2, d).rotateY(yaw));
      // One large pane with a slim off-centre divider, like an observation window.
      add(p, 'frame', new BoxGeometry(0.05, glassH, 0.08).translate(s * 0.28, glassY, d).rotateY(yaw));
      add(p, 'glass', new PlaneGeometry(s - 0.16, glassH).translate(0, glassY, d - 0.02).rotateY(yaw));
      add(p, 'cyan', new BoxGeometry(s - 0.3, 0.03, 0.03).translate(0, h - HEADER_H - 0.02, d + 0.045).rotateY(yaw));
      add(p, 'red', new BoxGeometry(0.05, 0.05, 0.02).translate(-s * 0.38, SILL_H * 0.5, d + 0.065).rotateY(yaw));
    }
    return p;
  }

  // ------------------------------------------------------------------ experiments

  /** Test subject floating in a glowing green stasis tube, hoses to the ceiling, side console. */
  private stasisTube(p: Parts, h: number): void {
    const bottom = 0.35;
    const top = Math.min(2.4, h - 0.8);
    const tubeH = top - bottom;
    add(p, 'frame', new CylinderGeometry(0.5, 0.55, bottom, 20).translate(0, bottom / 2, 0));
    add(p, 'frame', new CylinderGeometry(0.5, 0.45, 0.35, 20).translate(0, top + 0.175, 0));
    add(p, 'liquid', new CylinderGeometry(0.44, 0.44, tubeH, 20).translate(0, bottom + tubeH / 2, 0));
    add(p, 'glass', new CylinderGeometry(0.46, 0.46, tubeH, 20, 1, true).translate(0, bottom + tubeH / 2, 0));
    add(p, 'cyan', new TorusGeometry(0.47, 0.02, 6, 24).rotateX(Math.PI / 2).translate(0, bottom + 0.02, 0));
    add(p, 'cyan', new TorusGeometry(0.47, 0.02, 6, 24).rotateX(Math.PI / 2).translate(0, top - 0.02, 0));
    // Hoses from the cap to the ceiling.
    for (const a of [0, 2.1, 4.2]) {
      const len = h - (top + 0.35);
      add(p, 'frame', new CylinderGeometry(0.035, 0.035, len, 6).translate(Math.cos(a) * 0.25, top + 0.35 + len / 2, Math.sin(a) * 0.25));
    }
    // Subject: arms drifting out, head bowed, breathing mask with a hose to the cap.
    for (const g of human(true)) add(p, 'skin', g.rotateX(0.08).translate(0, bottom + 0.15, 0));
    add(p, 'frame', new BoxGeometry(0.1, 0.08, 0.06).translate(0, bottom + 0.15 + 1.55, 0.13));
    add(p, 'frame', new CylinderGeometry(0.015, 0.015, top - (bottom + 1.72), 5).translate(0, (top + bottom + 1.72) / 2, 0.14));
    // Console beside the tube.
    add(p, 'frame', new BoxGeometry(0.5, 1.1, 0.35).translate(0.85, 0.55, -0.55));
    add(p, 'screen', new BoxGeometry(0.4, 0.26, 0.02).rotateX(-0.4).translate(0.85, 1.12, -0.37));
    add(p, 'red', new BoxGeometry(0.06, 0.03, 0.02).translate(0.7, 0.85, -0.37));
    add(p, 'cyan', new BoxGeometry(0.06, 0.03, 0.02).translate(0.8, 0.85, -0.37));
  }

  /** Test subject strapped to an operating table under a surgical lamp, robot arm, monitor, IV drip. */
  private operatingTable(p: Parts, h: number): void {
    const tableY = 0.85;
    add(p, 'panel', new BoxGeometry(1.9, 0.08, 0.7).translate(0, tableY, 0));
    add(p, 'frame', new CylinderGeometry(0.12, 0.2, tableY, 10).translate(0, tableY / 2, 0));
    for (const x of [-0.4, 0.35]) add(p, 'frame', new BoxGeometry(0.06, 0.03, 0.74).translate(x, tableY + 0.1, 0));
    // Lying face up, head toward -X.
    for (const g of human(false)) add(p, 'skin', g.rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(0.88, tableY + 0.14, 0));
    // Surgical lamp.
    add(p, 'frame', new CylinderGeometry(0.02, 0.02, h - 2.3, 6).translate(-0.3, (h + 2.3) / 2, 0));
    add(p, 'frame', new CylinderGeometry(0.3, 0.34, 0.1, 18).translate(-0.3, 2.3, 0));
    add(p, 'warm', new CylinderGeometry(0.27, 0.27, 0.01, 18).translate(-0.3, 2.245, 0));
    // Robot arm reaching over the chest, red laser tip.
    add(p, 'frame', new CylinderGeometry(0.12, 0.16, 0.2, 12).translate(0.8, 0.1, -0.75));
    add(p, 'frame', new CylinderGeometry(0.05, 0.05, 1.5, 8).translate(0.8, 0.85, -0.75));
    add(p, 'frame', new SphereGeometry(0.08, 10, 8).translate(0.8, 1.6, -0.75));
    add(p, 'frame', rod(new Vector3(0.8, 1.6, -0.75), new Vector3(0.38, 1.28, -0.1), 0.04));
    add(p, 'red', new SphereGeometry(0.03, 8, 6).translate(0.35, 1.25, -0.08));
    // Monitor on a pole, facing the glass.
    add(p, 'frame', new CylinderGeometry(0.025, 0.025, 1.5, 6).translate(-0.95, 0.75, -0.8));
    add(p, 'frame', new BoxGeometry(0.6, 0.4, 0.05).translate(-0.95, 1.65, -0.8));
    add(p, 'screen', new BoxGeometry(0.52, 0.32, 0.01).translate(-0.95, 1.65, -0.77));
    // IV stand with a drip bag.
    add(p, 'frame', new CylinderGeometry(0.015, 0.015, 1.9, 6).translate(-0.7, 0.95, 0.55));
    add(p, 'liquid', new BoxGeometry(0.14, 0.24, 0.05).translate(-0.7, 1.7, 0.55));
  }

  /** Server racks with blinking status lights along the back, a terminal and a crate. */
  private serverBay(p: Parts, h: number): void {
    const rackH = Math.min(2.1, h - 0.6);
    for (const x of [-0.72, 0, 0.72]) {
      add(p, 'frame', new BoxGeometry(0.62, rackH, 0.6).translate(x, rackH / 2, -0.62));
      add(p, 'panel', new BoxGeometry(0.56, rackH - 0.1, 0.02).translate(x, rackH / 2, -0.31));
      for (let row = 0; row < 7; row++) {
        const y = 0.3 + row * ((rackH - 0.5) / 6);
        add(p, 'frame', new BoxGeometry(0.5, 0.05, 0.02).translate(x, y, -0.295));
        add(p, row % 3 === 0 ? 'red' : 'screen', new BoxGeometry(0.03, 0.02, 0.01).translate(x + 0.2, y, -0.284));
        add(p, 'cyan', new BoxGeometry(0.03, 0.02, 0.01).translate(x + 0.14, y, -0.284));
      }
    }
    // Terminal desk facing the racks.
    add(p, 'panel', new BoxGeometry(0.9, 0.05, 0.45).translate(0.35, 0.78, 0.45));
    add(p, 'frame', new BoxGeometry(0.06, 0.76, 0.4).translate(-0.05, 0.38, 0.45));
    add(p, 'frame', new BoxGeometry(0.06, 0.76, 0.4).translate(0.75, 0.38, 0.45));
    add(p, 'frame', new BoxGeometry(0.5, 0.32, 0.04).rotateX(-0.2).translate(0.35, 1.02, 0.35));
    add(p, 'screen', new BoxGeometry(0.44, 0.26, 0.01).rotateX(-0.2).translate(0.35, 1.02, 0.325));
    add(p, 'frame', new BoxGeometry(0.5, 0.4, 0.45).translate(-0.8, 0.2, 0.6));
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const mesh of this.meshes) mesh.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}

function add(p: Parts, key: MatKey, geo: BufferGeometry): void {
  (p[key] ??= []).push(geo);
}

/** A 1.75 m human figure standing on the origin, facing +Z. */
function human(armsOut: boolean): BufferGeometry[] {
  const armTilt = armsOut ? 0.25 : 0.05;
  const parts: BufferGeometry[] = [
    new SphereGeometry(0.11, 14, 10).scale(0.9, 1.08, 1).translate(0, 1.6, 0),
    new CylinderGeometry(0.045, 0.05, 0.1, 8).translate(0, 1.47, 0),
    new CapsuleGeometry(0.15, 0.32, 4, 12).scale(1, 1, 0.62).translate(0, 1.17, 0),
    new SphereGeometry(0.15, 12, 8).scale(1.05, 0.6, 0.7).translate(0, 0.88, 0),
  ];
  for (const s of [-1, 1]) {
    parts.push(new CapsuleGeometry(0.065, 0.72, 4, 8).translate(s * 0.09, 0.44, 0));
    parts.push(new CapsuleGeometry(0.048, 0.6, 4, 8).translate(0, -0.34, 0).rotateZ(s * armTilt).translate(s * 0.21, 1.36, 0));
  }
  return parts;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  // Normalise to non-indexed position/normal/uv so every primitive merges.
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false);
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  if (!merged) throw new Error('[LabChambers] failed to merge geometry');
  merged.computeBoundingSphere();
  return merged;
}

/** Cylinder of radius r running from a to b. */
function rod(a: Vector3, b: Vector3, r: number): BufferGeometry {
  const dir = b.clone().sub(a);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return new CylinderGeometry(r, r, dir.length(), 8).applyQuaternion(q).translate(mid.x, mid.y, mid.z);
}
