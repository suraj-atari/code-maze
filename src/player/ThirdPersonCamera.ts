import type { PerspectiveCamera } from 'three';
import type { PlayerConfig } from '../config/types';
import type { MazeData } from '../maze/MazeData';
import { damp } from '../utils/math';
import type { CameraRigInput } from './FirstPersonCamera';

/** Samples along the camera boom when checking for walls. */
const BOOM_STEPS = 24;

/**
 * Over-the-shoulder camera: orbits behind the player's head (right shoulder offset) following
 * yaw/pitch, and pulls in when walls, floor or ceiling are in the way (grid-based, so it never
 * ends up inside a wall). It looks along the same direction as the first-person camera, so the
 * crosshair still aims where the player faces.
 */
export class ThirdPersonCamera {
  private eyeHeight: number;
  /** 0..1 fraction of the full boom currently used. */
  private boom = 1;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly config: PlayerConfig,
  ) {
    this.eyeHeight = config.eyeHeight;
  }

  reset(): void {
    this.eyeHeight = this.config.eyeHeight;
    this.boom = 1;
  }

  /** @returns distance (m) from the head to the camera, so the owner can hide the body when too close */
  update(p: CameraRigInput, maze: MazeData | null, wallHeight: number, dt: number): number {
    const c = this.config;
    const tp = c.thirdPerson;
    this.eyeHeight = damp(this.eyeHeight, p.crouching ? c.crouchEyeHeight : c.eyeHeight, 10, dt);

    const px = p.x;
    const py = p.y + this.eyeHeight + tp.height;
    const pz = p.z;
    const cp = Math.cos(p.pitch);
    const fx = -Math.sin(p.yaw) * cp;
    const fy = Math.sin(p.pitch);
    const fz = -Math.cos(p.yaw) * cp;
    const rx = Math.cos(p.yaw);
    const rz = -Math.sin(p.yaw);
    // Boom: back along the look direction and out over the right shoulder.
    const ox = rx * tp.shoulder - fx * tp.distance;
    const oy = -fy * tp.distance;
    const oz = rz * tp.shoulder - fz * tp.distance;

    let free = 1;
    if (maze) {
      for (let i = 1; i <= BOOM_STEPS; i++) {
        const t = i / BOOM_STEPS;
        if (!this.isFree(maze, wallHeight, px + ox * t, py + oy * t, pz + oz * t, tp.collisionRadius)) {
          free = (i - 1) / BOOM_STEPS;
          break;
        }
      }
    }
    // Snap in immediately when blocked; ease back out when clear.
    this.boom = free < this.boom ? free : damp(this.boom, free, 4, dt);

    const b = this.boom;
    this.camera.position.set(px + ox * b, py + oy * b, pz + oz * b);
    this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    return b * Math.hypot(ox, oy, oz);
  }

  private isFree(maze: MazeData, wallHeight: number, x: number, y: number, z: number, r: number): boolean {
    if (y < 0.15 || y > wallHeight - 0.15) return false;
    const s = maze.cellSize;
    return (
      !maze.isBlocked(Math.floor((x - r) / s), Math.floor((z - r) / s)) &&
      !maze.isBlocked(Math.floor((x + r) / s), Math.floor((z - r) / s)) &&
      !maze.isBlocked(Math.floor((x - r) / s), Math.floor((z + r) / s)) &&
      !maze.isBlocked(Math.floor((x + r) / s), Math.floor((z + r) / s))
    );
  }
}
