import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type BufferAttribute,
  type Texture,
} from 'three';
import type { MazeConfig } from '../config/types';
import { LabChambers, pickChambers } from './LabChambers';
import type { MazeData } from './MazeData';

export interface MazeTextures {
  readonly wall: Texture;
  readonly wallEmissive: Texture;
  readonly floor: Texture;
  readonly ceiling: Texture;
  readonly ceilingEmissive: Texture;
}

/**
 * Visual representation of MazeData.
 *  - Walls: one InstancedMesh per spatial chunk (chunkCells²) so the renderer can frustum-cull
 *    whole chunks; wall cells that touch no floor are skipped entirely.
 *  - Floor & ceiling: a single plane each, UVs scaled so textures tile once per cell.
 *  - Lab chambers: some wall cells are drawn as glass-walled labs (see LabChambers) instead of
 *    solid blocks; they remain walls for physics and AI.
 */
export class MazeRenderer {
  readonly root = new Group();
  private readonly wallGeometry: BoxGeometry;
  private readonly wallMaterial: MeshStandardMaterial;
  private readonly floorMaterial: MeshStandardMaterial;
  private readonly ceilingMaterial: MeshStandardMaterial;
  private readonly planeGeometries: PlaneGeometry[] = [];
  private readonly chunks: InstancedMesh[] = [];
  private readonly chamberCells: ReadonlySet<number>;
  private readonly chambers: LabChambers;

  constructor(
    private readonly maze: MazeData,
    private readonly config: MazeConfig,
    textures: MazeTextures,
    private readonly shadows: boolean,
  ) {
    this.root.name = 'maze';
    const s = maze.cellSize;
    this.wallGeometry = new BoxGeometry(s, config.wallHeight, s);
    this.wallMaterial = new MeshStandardMaterial({
      map: textures.wall,
      emissiveMap: textures.wallEmissive,
      // The emissive map carries its own colours (amber, orange, dim yellow).
      emissive: new Color(0xffffff),
      emissiveIntensity: 1,
      roughness: 0.62,
      metalness: 0.25,
    });
    this.floorMaterial = new MeshStandardMaterial({ map: textures.floor, roughness: 0.7, metalness: 0.15 });
    // Ceiling carries glowing fluorescent panels like a lit lab corridor.
    this.ceilingMaterial = new MeshStandardMaterial({
      map: textures.ceiling,
      emissiveMap: textures.ceilingEmissive,
      emissive: new Color(0xffffff),
      emissiveIntensity: 1,
      roughness: 0.9,
      metalness: 0.05,
    });

    const chambers = pickChambers(maze);
    this.chamberCells = new Set(chambers.map((c) => c.index));
    this.chambers = new LabChambers(maze, chambers, s, config.wallHeight);
    this.root.add(this.chambers.root);

    this.buildWalls();
    this.buildPlanes();
  }

  /** Emissive light strips and ceiling panels fade as the level gets darker. */
  setEmissiveIntensity(value: number): void {
    this.wallMaterial.emissiveIntensity = value;
    this.ceilingMaterial.emissiveIntensity = value;
  }

  get drawCallEstimate(): number {
    return this.chunks.length + 2 + this.chambers.drawCallEstimate;
  }

  /** Chamber cells are walls for physics, but see-through for rendering. */
  private isSolid(x: number, y: number): boolean {
    return this.maze.isWall(x, y) && !(this.maze.inBounds(x, y) && this.chamberCells.has(this.maze.index(x, y)));
  }

  private isVisibleWall(x: number, y: number): boolean {
    if (!this.isSolid(x, y)) return false;
    return !this.isSolid(x + 1, y) || !this.isSolid(x - 1, y) || !this.isSolid(x, y + 1) || !this.isSolid(x, y - 1);
  }

  private buildWalls(): void {
    const { maze, config } = this;
    const s = maze.cellSize;
    const cs = config.chunkCells;
    const m = new Matrix4();
    const chunkX = Math.ceil(maze.width / cs);
    const chunkY = Math.ceil(maze.height / cs);

    for (let cy = 0; cy < chunkY; cy++) {
      for (let cx = 0; cx < chunkX; cx++) {
        const x0 = cx * cs;
        const y0 = cy * cs;
        const x1 = Math.min(maze.width, x0 + cs);
        const y1 = Math.min(maze.height, y0 + cs);

        let count = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (this.isVisibleWall(x, y)) count++;
        if (count === 0) continue;

        const mesh = new InstancedMesh(this.wallGeometry, this.wallMaterial, count);
        mesh.name = `walls-${cx}-${cy}`;
        let i = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            if (!this.isVisibleWall(x, y)) continue;
            m.makeTranslation((x + 0.5) * s, config.wallHeight / 2, (y + 0.5) * s);
            mesh.setMatrixAt(i++, m);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
        mesh.castShadow = this.shadows;
        mesh.receiveShadow = this.shadows;
        this.chunks.push(mesh);
        this.root.add(mesh);
      }
    }
  }

  private buildPlanes(): void {
    const { maze, config } = this;
    const w = maze.width * maze.cellSize;
    const d = maze.height * maze.cellSize;

    const makePlane = (material: MeshStandardMaterial, y: number, rotX: number): Mesh => {
      const geo = new PlaneGeometry(w, d);
      const uv = geo.getAttribute('uv') as BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * maze.width, uv.getY(i) * maze.height);
      this.planeGeometries.push(geo);
      const mesh = new Mesh(geo, material);
      mesh.rotation.x = rotX;
      mesh.position.set(w / 2, y, d / 2);
      mesh.receiveShadow = this.shadows;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.root.add(mesh);
      return mesh;
    };

    makePlane(this.floorMaterial, 0, -Math.PI / 2).name = 'floor';
    makePlane(this.ceilingMaterial, config.wallHeight, Math.PI / 2).name = 'ceiling';
  }

  dispose(): void {
    this.root.removeFromParent();
    this.chambers.dispose();
    for (const c of this.chunks) c.dispose();
    this.wallGeometry.dispose();
    for (const g of this.planeGeometries) g.dispose();
    // Textures are owned by the AssetManager and shared across levels.
    this.wallMaterial.dispose();
    this.floorMaterial.dispose();
    this.ceilingMaterial.dispose();
  }
}
