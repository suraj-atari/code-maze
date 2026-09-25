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
import { LabChambers, type Chamber } from './LabChambers';
import type { MazeData } from './MazeData';

export interface MazeTextures {
  readonly wall: Texture;
  readonly wallEmissive: Texture;
  /** Opacity of the window glass layer. */
  readonly wallGlass: Texture;
  readonly floor: Texture;
  readonly ceiling: Texture;
  readonly ceilingEmissive: Texture;
}

/**
 * Visual representation of MazeData.
 *  - Walls: one InstancedMesh per spatial chunk (chunkCells²) so the renderer can frustum-cull
 *    whole chunks; wall cells that touch no floor are skipped entirely.
 *  - Floor & ceiling: a single plane each, UVs scaled so textures tile once per cell.
 *  - Each wall face has a glass window: the wall material cuts the pane out of the texture
 *    (alphaTest, so it stays an opaque, depth-sorted draw) and a second, transparent glass
 *    material on the same instanced mesh fills it. Robots still cannot see through (grid AI).
 *  - Lab chambers: some wall cells are drawn as lab rooms with a sliding door (see LabChambers)
 *    instead of solid blocks; the player can walk in, the AI still treats them as walls.
 */
export class MazeRenderer {
  readonly root = new Group();
  private readonly wallGeometry: BoxGeometry;
  private readonly wallMaterial: MeshStandardMaterial;
  /** Tinted glass drawn over the window cut out of every wall face. */
  private readonly glassMaterial: MeshStandardMaterial;
  /** Lab rooms: the same wall, but with the window pane opaque so hideouts stay private. */
  private readonly roomWallMaterial: MeshStandardMaterial;
  private readonly floorMaterial: MeshStandardMaterial;
  private readonly ceilingMaterial: MeshStandardMaterial;
  private readonly planeGeometries: PlaneGeometry[] = [];
  private readonly chunks: InstancedMesh[] = [];
  private readonly chambers: LabChambers;

  constructor(
    private readonly maze: MazeData,
    chambers: readonly Chamber[],
    private readonly config: MazeConfig,
    textures: MazeTextures,
    private readonly shadows: boolean,
  ) {
    this.root.name = 'maze';
    const s = maze.cellSize;
    this.wallGeometry = wallBox(s, config.wallHeight);
    this.wallMaterial = new MeshStandardMaterial({
      map: textures.wall,
      emissiveMap: textures.wallEmissive,
      // The emissive map carries its own colours (amber, orange, dim yellow).
      emissive: new Color(0xffffff),
      emissiveIntensity: 1,
      roughness: 0.62,
      metalness: 0.25,
      alphaTest: 0.5,
    });
    this.glassMaterial = new MeshStandardMaterial({
      color: 0xa8e4ee,
      alphaMap: textures.wallGlass,
      transparent: true,
      depthWrite: false,
      roughness: 0.2,
      metalness: 0.1,
    });
    this.roomWallMaterial = this.wallMaterial.clone();
    this.roomWallMaterial.alphaTest = 0;
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

    this.chambers = new LabChambers(maze, chambers, s, config.wallHeight, this.roomWallMaterial);
    this.root.add(this.chambers.root);

    this.buildWalls();
    this.buildPlanes();
  }

  /** Emissive light strips and ceiling panels fade as the level gets darker. */
  setEmissiveIntensity(value: number): void {
    this.wallMaterial.emissiveIntensity = value;
    this.roomWallMaterial.emissiveIntensity = value;
    this.ceilingMaterial.emissiveIntensity = value;
  }

  /** Animates the lab room doors around the player. */
  update(dt: number, playerX: number, playerZ: number): void {
    this.chambers.update(dt, playerX, playerZ);
  }

  get drawCallEstimate(): number {
    return this.chunks.length + 2 + this.chambers.drawCallEstimate;
  }

  /** Chamber cells (hideouts) are walls for the AI, but open for rendering. */
  private isSolid(x: number, y: number): boolean {
    return this.maze.isBlocked(x, y);
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

        const mesh = new InstancedMesh(this.wallGeometry, [this.wallMaterial, this.glassMaterial], count);
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
    this.glassMaterial.dispose();
    this.roomWallMaterial.dispose();
    this.floorMaterial.dispose();
    this.ceilingMaterial.dispose();
  }
}

/**
 * Wall block with two draw groups over all faces (0: wall, 1: window glass). Top and bottom
 * faces sample a plain spot of the header trim, so no window is punched into them.
 */
function wallBox(size: number, height: number): BoxGeometry {
  const geo = new BoxGeometry(size, height, size);
  const uv = geo.getAttribute('uv') as BufferAttribute;
  // BoxGeometry faces: +X, -X, +Y, -Y, +Z, -Z, four vertices each.
  for (let i = 8; i < 16; i++) uv.setXY(i, 0.5, 0.9);
  const count = geo.index!.count;
  geo.clearGroups();
  geo.addGroup(0, count, 0);
  geo.addGroup(0, count, 1);
  return geo;
}
