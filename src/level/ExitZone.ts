import {
  AdditiveBlending,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RingGeometry,
} from 'three';
import { firstOpenNeighbour } from '../maze/MazeAnalysis';
import type { MazeData } from '../maze/MazeData';

const EXIT_COLOR = 0x35ff9a;
const LOCKED_COLOR = 0xff3a2a;

/** The level exit: a glowing force-field gate with a beacon light. Logic + its own visuals. */
export class ExitZone {
  readonly root = new Group();
  readonly position = { x: 0, y: 1.2, z: 0 };
  private readonly light: PointLight;
  private readonly fieldMaterial: MeshBasicMaterial;
  private readonly frameMaterial: MeshStandardMaterial;
  private readonly ringMaterial: MeshBasicMaterial;
  private readonly geometries: Array<BoxGeometry | PlaneGeometry | RingGeometry> = [];

  constructor(maze: MazeData, wallHeight: number) {
    const cell = maze.exitCell;
    const s = maze.cellSize;
    this.position.x = maze.centerX(cell);
    this.position.z = maze.centerZ(cell);
    this.root.name = 'exit';
    this.root.position.set(this.position.x, 0, this.position.z);

    // Face the corridor the player arrives from; the gate sits at the far side of the cell.
    const n = firstOpenNeighbour(maze, cell);
    if (n >= 0) {
      const dx = maze.centerX(n) - this.position.x;
      const dz = maze.centerZ(n) - this.position.z;
      this.root.rotation.y = Math.atan2(dx, dz);
    }

    this.frameMaterial = new MeshStandardMaterial({
      color: 0x1b2a24,
      emissive: EXIT_COLOR,
      emissiveIntensity: 0.6,
      metalness: 0.6,
      roughness: 0.4,
    });
    this.fieldMaterial = new MeshBasicMaterial({
      color: EXIT_COLOR,
      transparent: true,
      opacity: 0.35,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    });
    this.ringMaterial = new MeshBasicMaterial({ color: EXIT_COLOR, transparent: true, opacity: 0.6, toneMapped: false });

    const h = wallHeight - 0.4;
    const halfW = s / 2 - 0.12;
    const gateZ = -s * 0.3;
    const pillar = this.geo(new BoxGeometry(0.2, h, 0.25));
    const beam = this.geo(new BoxGeometry(s - 0.1, 0.22, 0.25));
    const field = this.geo(new PlaneGeometry(s - 0.35, h - 0.2));
    const ring = this.geo(new RingGeometry(0.55, 0.75, 32));

    const left = new Mesh(pillar, this.frameMaterial);
    left.position.set(-halfW, h / 2, gateZ);
    const right = new Mesh(pillar, this.frameMaterial);
    right.position.set(halfW, h / 2, gateZ);
    const top = new Mesh(beam, this.frameMaterial);
    top.position.set(0, h, gateZ);
    const fieldMesh = new Mesh(field, this.fieldMaterial);
    fieldMesh.position.set(0, h / 2, gateZ);
    const ringMesh = new Mesh(ring, this.ringMaterial);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.02;

    this.light = new PointLight(EXIT_COLOR, 9, 7, 2);
    this.light.position.set(0, 2, 0);
    this.root.add(left, right, top, fieldMesh, ringMesh, this.light);
  }

  /** Locked gate glows red until the wing's keycard is found. */
  setLocked(locked: boolean): void {
    const c = locked ? LOCKED_COLOR : EXIT_COLOR;
    this.fieldMaterial.color.setHex(c);
    this.ringMaterial.color.setHex(c);
    this.frameMaterial.emissive.setHex(c);
    this.light.color.setHex(c);
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(x - this.position.x, z - this.position.z);
  }

  update(time: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    this.fieldMaterial.opacity = 0.25 + 0.2 * pulse;
    this.light.intensity = 7 + 4 * pulse;
  }

  private geo<T extends BoxGeometry | PlaneGeometry | RingGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.geometries) g.dispose();
    this.fieldMaterial.dispose();
    this.frameMaterial.dispose();
    this.ringMaterial.dispose();
    this.light.dispose();
  }
}
