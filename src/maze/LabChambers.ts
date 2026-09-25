import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
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

/**
 * Two wall cells in a row turned into a lab room (1 × 2 cells) with a sliding door the player can
 * step into and hide in. The door is in the front cell; the equipment stands in the back cell.
 */
export interface Chamber {
  /** Front cell (with the door toward the corridor). */
  readonly index: number;
  /** Back cell, directly behind the front one. */
  readonly backIndex: number;
  /** Yaw that turns the chamber's front (+Z, with the door) toward a corridor. */
  readonly yaw: number;
  /** Grid direction of the front (door side). */
  readonly frontDx: number;
  readonly frontDy: number;
  readonly variant: number;
}

/**
 * Solid furniture inside a chamber: half extents and centre in prop space (front = +Z), which is
 * centred on the back cell (room centre + PROP_SHIFT_CELLS · cell size along Z).
 */
export interface ChamberObstacle {
  readonly hx: number;
  readonly hz: number;
  readonly x: number;
  readonly z: number;
  readonly height: number;
}

/** Colliders for the big props of each variant, so the player walks around them. */
export const CHAMBER_OBSTACLES: readonly (readonly ChamberObstacle[])[] = [
  [
    { hx: 0.52, hz: 0.52, x: 0, z: 0, height: 2.8 },
    { hx: 0.25, hz: 0.18, x: 0.85, z: -0.55, height: 1.1 },
  ],
  [{ hx: 0.95, hz: 0.35, x: 0, z: 0, height: 0.9 }],
  [
    { hx: 1.03, hz: 0.3, x: 0, z: -0.62, height: 2.1 },
    { hx: 0.45, hz: 0.22, x: 0.35, z: 0.45, height: 0.8 },
    { hx: 0.25, hz: 0.22, x: -0.8, z: 0.6, height: 0.4 },
  ],
];

/** Props stand in the back cell: prop space origin, in cells from the room centre along Z. */
export const PROP_SHIFT_CELLS = -0.5;

/** World-space centre of a room (between its two cells). */
export function chamberCenter(maze: MazeData, c: Chamber): { x: number; z: number } {
  return {
    x: (maze.centerX(c.index) + maze.centerX(c.backIndex)) / 2,
    z: (maze.centerZ(c.index) + maze.centerZ(c.backIndex)) / 2,
  };
}

type MatKey = 'frame' | 'panel' | 'wall' | 'glass' | 'liquid' | 'haze' | 'cyan' | 'warm' | 'red' | 'screen';
type Parts = Partial<Record<MatKey, BufferGeometry[]>>;

const VARIANTS = 3;
/** Minimum spacing (cells, Chebyshev distance) between chambers: 2 = never touching. */
const SPACING = 2;
const MAX_CHAMBERS = 40;
/** Roughly one chamber per this many floor cells, so most corridors pass a room to hide in. */
const FLOOR_CELLS_PER_CHAMBER = 9;
/** Heights of the skirting below and the header above each wall panel. */
const SILL_H = 0.5;
const HEADER_H = 0.35;
/** Width of the doorway in the front wall (two sliding leaves). */
export const DOOR_WIDTH = 1.3;
const LEAF_W = DOOR_WIDTH / 2;
const LEAF_T = 0.06;
/** How far each leaf slides into the wall beside the doorway. */
const LEAF_SLIDE = LEAF_W - 0.06;
/** The door opens while the player outside is within this distance of it. */
const DOOR_OPEN_RADIUS = 1.9;
/** Inside, it only opens when the player walks right up to it: step in and it shuts behind you. */
const DOOR_INSIDE_RADIUS = 1.0;
const DOOR_SPEED = 3.2;
const DOOR_OPEN_COLOR = new Color(0x35ff9a);
const DOOR_CLOSED_COLOR = new Color(0xff3b30);

/**
 * Picks pairs of wall cells (front + back, in a line away from a corridor) that become lab rooms.
 * Deterministic per maze, and it does not consume the level's RNG, so robot/armory placement is
 * unchanged. Room cells stay walls for the AI (hideouts).
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
    const near = (cx: number, cy: number): boolean =>
      chambers.some((c) =>
        [c.index, c.backIndex].some(
          (o) => Math.max(Math.abs(maze.cellX(o) - cx), Math.abs(maze.cellY(o) - cy)) < SPACING,
        ),
      );
    if (near(x, y)) continue;
    // Door toward an open neighbour (+Z local → that direction); the back cell continues the
    // line into the wall and must be an inner wall cell too.
    const dirs = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ] as const;
    const fits = dirs.filter(([dx, dy]) => {
      const bx = x - dx;
      const by = y - dy;
      return (
        !maze.isWall(x + dx, y + dy) &&
        maze.isWall(bx, by) &&
        bx >= 1 &&
        by >= 1 &&
        bx <= maze.width - 2 &&
        by <= maze.height - 2 &&
        !near(bx, by)
      );
    });
    if (fits.length === 0) continue;
    const [dx, dy] = fits[rng.int(fits.length)]!;
    chambers.push({
      index,
      backIndex: maze.index(x - dx, y - dy),
      yaw: Math.atan2(dx, dy),
      frontDx: dx,
      frontDy: dy,
      variant: rng.int(VARIANTS),
    });
  }
  return chambers;
}

/**
 * Visuals of the lab rooms (1 × 2 cells): solid metal walls, a front wall with a sliding steel
 * double door (opens as the player comes close and shuts once they are inside; status light
 * red/green), two lit ceiling panels with hazy light shafts, open floor in the front half and in
 * the back half an (empty) stasis tube (variant 0), an operating table (variant 1) or a server bay
 * (variant 2).
 * Static geometry is merged per (variant, material) and drawn instanced across all rooms of that
 * variant; all door leaves share one instanced mesh, so the whole set costs about 20 draw calls.
 */
export class LabChambers {
  readonly root = new Group();
  private readonly materials: Record<MatKey, Material>;
  private readonly geometries: BufferGeometry[] = [];
  private readonly meshes: InstancedMesh[] = [];
  private readonly maze: MazeData;
  private readonly chambers: readonly Chamber[];
  private readonly doorX: Float32Array;
  private readonly doorZ: Float32Array;
  /** 0 closed … 1 open, per chamber. */
  private readonly openT: Float32Array;
  private readonly leaves: InstancedMesh | null = null;
  private readonly stripes: InstancedMesh | null = null;
  private readonly lights: InstancedMesh | null = null;
  private readonly doorMaterials: Material[] = [];
  private readonly base = new Matrix4();
  private readonly local = new Matrix4();
  private readonly frontOffset: number;
  private readonly doorHeight: number;

  /** @param wallMaterial the maze's wall material (shared, not disposed here): rooms blend into the corridors */
  constructor(maze: MazeData, chambers: readonly Chamber[], cellSize: number, wallHeight: number, wallMaterial: Material) {
    this.root.name = 'lab-chambers';
    this.maze = maze;
    this.chambers = chambers;
    // Local frame: origin at the room centre, the door wall one cell ahead (+Z).
    this.frontOffset = cellSize - 0.08;
    this.doorHeight = wallHeight - HEADER_H;
    this.doorX = new Float32Array(chambers.length);
    this.doorZ = new Float32Array(chambers.length);
    this.openT = new Float32Array(chambers.length);
    this.materials = {
      frame: new MeshStandardMaterial({ color: 0x2b3438, metalness: 0.5, roughness: 0.45 }),
      panel: new MeshStandardMaterial({ color: 0x9aa8ab, metalness: 0.2, roughness: 0.6 }),
      wall: wallMaterial,
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
      const props: Parts = {};
      if (v === 0) this.stasisTube(props, wallHeight);
      else if (v === 1) this.operatingTable(props, wallHeight);
      else this.serverBay(props, wallHeight);
      // Equipment stands in the back cell.
      for (const key of Object.keys(props) as MatKey[]) {
        for (const g of props[key]!) add(parts, key, g.translate(0, 0, PROP_SHIFT_CELLS * cellSize));
      }

      for (const key of Object.keys(parts) as MatKey[]) {
        const geo = merge(parts[key]!);
        this.geometries.push(geo);
        const mesh = new InstancedMesh(geo, this.materials[key], list.length);
        mesh.name = `chamber-${v}-${key}`;
        // Liquid is drawn before the glass that surrounds it, the light haze last.
        mesh.renderOrder = key === 'liquid' ? 1 : key === 'glass' ? 2 : key === 'haze' ? 3 : 0;
        list.forEach((c, i) => {
          const at = chamberCenter(maze, c);
          m.makeRotationY(c.yaw).setPosition(at.x, 0, at.z);
          mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
        this.meshes.push(mesh);
        this.root.add(mesh);
      }
    }

    // Sliding double doors: two leaves per room, a hazard stripe on each, a status light above.
    const n = chambers.length;
    const leafGeo = new BoxGeometry(LEAF_W, this.doorHeight, LEAF_T);
    const stripeGeo = new BoxGeometry(LEAF_W, 0.14, LEAF_T + 0.012).translate(0, -this.doorHeight * 0.12, 0);
    const lightGeo = new BoxGeometry(0.22, 0.06, 0.04);
    this.geometries.push(leafGeo, stripeGeo, lightGeo);
    const leafMat = new MeshStandardMaterial({ color: 0x6b7680, metalness: 0.75, roughness: 0.38 });
    const stripeMat = new MeshStandardMaterial({ color: 0xd9a21b, metalness: 0.3, roughness: 0.6, emissive: 0x2a1c00 });
    const lightMat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.doorMaterials.push(leafMat, stripeMat, lightMat);
    this.leaves = new InstancedMesh(leafGeo, leafMat, n * 2);
    this.stripes = new InstancedMesh(stripeGeo, stripeMat, n * 2);
    this.lights = new InstancedMesh(lightGeo, lightMat, n);
    this.leaves.name = 'chamber-door-leaves';
    this.stripes.name = 'chamber-door-stripes';
    this.lights.name = 'chamber-door-lights';
    chambers.forEach((c, i) => {
      const at = chamberCenter(maze, c);
      this.doorX[i] = at.x + c.frontDx * this.frontOffset;
      this.doorZ[i] = at.z + c.frontDy * this.frontOffset;
      this.placeDoor(i);
      this.local.makeTranslation(0, this.doorHeight + 0.08, this.frontOffset + 0.07).premultiply(this.base);
      this.lights!.setMatrixAt(i, this.local);
      this.lights!.setColorAt(i, DOOR_CLOSED_COLOR);
    });
    for (const mesh of [this.leaves, this.stripes, this.lights]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Leaves move after the bounds would have been computed.
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.root.add(mesh);
    }
  }

  get drawCallEstimate(): number {
    return this.meshes.length;
  }

  /**
   * Opens a door when the player comes up to it from the corridor, shuts it behind them once
   * they are inside, and opens it again when they walk back up to it to leave.
   */
  update(dt: number, playerX: number, playerZ: number): void {
    const leaves = this.leaves;
    const lights = this.lights;
    if (!leaves || !lights) return;
    const playerCell = this.maze.cellAt(playerX, playerZ);
    let moved = false;
    for (let i = 0; i < this.chambers.length; i++) {
      const c = this.chambers[i]!;
      const inside = playerCell === c.index || playerCell === c.backIndex;
      const r = inside ? DOOR_INSIDE_RADIUS : DOOR_OPEN_RADIUS;
      const dx = playerX - this.doorX[i]!;
      const dz = playerZ - this.doorZ[i]!;
      const target = dx * dx + dz * dz < r * r ? 1 : 0;
      const t = this.openT[i]!;
      if (t === target) continue;
      const next = target > t ? Math.min(1, t + DOOR_SPEED * dt) : Math.max(0, t - DOOR_SPEED * dt);
      this.openT[i] = next;
      this.placeDoor(i);
      if (t > 0.5 !== next > 0.5) {
        lights.setColorAt(i, next > 0.5 ? DOOR_OPEN_COLOR : DOOR_CLOSED_COLOR);
        lights.instanceColor!.needsUpdate = true;
      }
      moved = true;
    }
    if (moved) {
      leaves.instanceMatrix.needsUpdate = true;
      this.stripes!.instanceMatrix.needsUpdate = true;
    }
  }

  /** Writes both leaves of chamber `i` (also leaves `base` = the chamber's transform). */
  private placeDoor(i: number): void {
    const c = this.chambers[i]!;
    const maze = this.maze;
    const t = this.openT[i]!;
    const slide = LEAF_SLIDE * t * t * (3 - 2 * t);
    const at = chamberCenter(maze, c);
    this.base.makeRotationY(c.yaw).setPosition(at.x, 0, at.z);
    // Leaves sit just inside the front wall and slide behind its side panels.
    const z = this.frontOffset - 0.06 - LEAF_T;
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? -1 : 1;
      this.local.makeTranslation(sx * (LEAF_W / 2 + slide), this.doorHeight / 2, z).premultiply(this.base);
      this.leaves!.setMatrixAt(i * 2 + side, this.local);
      this.stripes!.setMatrixAt(i * 2 + side, this.local);
    }
  }

  // ------------------------------------------------------------------ chamber shell

  /**
   * Room shell, `s` wide and `2s` deep around the origin: floor plate, a ceiling light + haze over
   * each half, corner posts, a header and light strip on every wall, solid metal walls on three
   * sides and a front wall (+Z) with the doorway.
   */
  private frameParts(s: number, h: number): Parts {
    const p: Parts = {};
    const depth = 2 * s;
    const dx = s / 2 - 0.08;
    const dz = depth / 2 - 0.08;
    const midH = h - SILL_H - HEADER_H;
    const panelW = (s - DOOR_WIDTH) / 2;
    add(p, 'panel', new BoxGeometry(s - 0.1, 0.03, depth - 0.1).translate(0, 0.015, 0));
    for (const z of [-s / 2, s / 2]) {
      add(p, 'warm', new BoxGeometry(1.0, 0.03, 0.5).translate(0, h - 0.03, z));
      add(p, 'haze', new CylinderGeometry(0.45, 1.05, h - 0.05, 16, 1, true).translate(0, (h - 0.05) / 2, z));
    }
    for (const [x, z] of [[dx, dz], [-dx, dz], [dx, -dz], [-dx, -dz]] as const) {
      add(p, 'frame', new BoxGeometry(0.14, h, 0.14).translate(x, h / 2, z));
    }
    // Walls: [yaw, length, distance from the centre]. Yaw 0 is the front (+Z).
    const walls = [
      [0, s, dz],
      [Math.PI, s, dz],
      [Math.PI / 2, depth, dx],
      [-Math.PI / 2, depth, dx],
    ] as const;
    for (const [yaw, len, d] of walls) {
      add(p, 'frame', new BoxGeometry(len, HEADER_H, 0.12).translate(0, h - HEADER_H / 2, d).rotateY(yaw));
      add(p, 'cyan', new BoxGeometry(len - 0.3, 0.03, 0.03).translate(0, h - HEADER_H - 0.02, d + 0.045).rotateY(yaw));
      if (yaw === 0) {
        // Front wall: solid panels either side of the doorway (the door leaves hide behind them).
        for (const sx of [-1, 1]) {
          const x = sx * (DOOR_WIDTH / 2 + panelW / 2);
          add(p, 'wall', new BoxGeometry(panelW, h - HEADER_H, 0.12).translate(x, (h - HEADER_H) / 2, d));
        }
        continue;
      }
      add(p, 'frame', new BoxGeometry(len, SILL_H, 0.12).translate(0, SILL_H / 2, d).rotateY(yaw));
      add(p, 'panel', new BoxGeometry(len - 0.2, 0.05, 0.18).translate(0, SILL_H + 0.02, d).rotateY(yaw));
      add(p, 'wall', new BoxGeometry(len - 0.02, midH, 0.1).translate(0, SILL_H + midH / 2, d).rotateY(yaw));
      add(p, 'red', new BoxGeometry(0.05, 0.05, 0.02).translate(-len * 0.38, SILL_H * 0.5, d + 0.065).rotateY(yaw));
    }
    return p;
  }

  // ------------------------------------------------------------------ experiments

  /** Glowing green stasis tube, hoses to the ceiling, side console. */
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
    // Console beside the tube.
    add(p, 'frame', new BoxGeometry(0.5, 1.1, 0.35).translate(0.85, 0.55, -0.55));
    add(p, 'screen', new BoxGeometry(0.4, 0.26, 0.02).rotateX(-0.4).translate(0.85, 1.12, -0.37));
    add(p, 'red', new BoxGeometry(0.06, 0.03, 0.02).translate(0.7, 0.85, -0.37));
    add(p, 'cyan', new BoxGeometry(0.06, 0.03, 0.02).translate(0.8, 0.85, -0.37));
  }

  /** Empty operating table under a surgical lamp, robot arm, monitor, IV drip. */
  private operatingTable(p: Parts, h: number): void {
    const tableY = 0.85;
    add(p, 'panel', new BoxGeometry(1.9, 0.08, 0.7).translate(0, tableY, 0));
    add(p, 'frame', new CylinderGeometry(0.12, 0.2, tableY, 10).translate(0, tableY / 2, 0));
    for (const x of [-0.4, 0.35]) add(p, 'frame', new BoxGeometry(0.06, 0.03, 0.74).translate(x, tableY + 0.1, 0));
    // Surgical lamp.
    add(p, 'frame', new CylinderGeometry(0.02, 0.02, h - 2.3, 6).translate(-0.3, (h + 2.3) / 2, 0));
    add(p, 'frame', new CylinderGeometry(0.3, 0.34, 0.1, 18).translate(-0.3, 2.3, 0));
    add(p, 'warm', new CylinderGeometry(0.27, 0.27, 0.01, 18).translate(-0.3, 2.245, 0));
    // Robot arm reaching over the table, red laser tip.
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
    for (const [key, m] of Object.entries(this.materials)) if (key !== 'wall') m.dispose();
    for (const m of this.doorMaterials) m.dispose();
  }
}

function add(p: Parts, key: MatKey, geo: BufferGeometry): void {
  (p[key] ??= []).push(geo);
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
