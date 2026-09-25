import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  LOD,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type Material,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetManager } from '../assets/AssetManager';

interface MergedParts {
  readonly body: BufferGeometry;
  readonly brass: BufferGeometry;
  readonly dark: BufferGeometry;
  readonly glow: BufferGeometry;
}

interface PartLists {
  readonly body: BufferGeometry[];
  readonly brass: BufferGeometry[];
  readonly dark: BufferGeometry[];
  readonly glow: BufferGeometry[];
}

/** Distance (m) at which the low-detail model takes over. */
const LOD_DISTANCE = 16;
/** Height of the eyes: the scan light is mounted here (see RobotView). */
export const ROBOT_EYE_Y = 1.83;

const box = (w: number, h: number, d: number, r: number): BufferGeometry => new RoundedBoxGeometry(w, h, d, 3, r);

/**
 * Builds robot visuals. If a 'robot' GLB was loaded by the AssetManager it is cloned (meshes
 * named "eye"/"visor"/"glow" receive the per-robot glow material); otherwise a procedural
 * retro walker is used: a wide rounded torso with a glowing chest core and side windows, a boxy
 * head with ring-framed eyes and wire antennae, brass joints, chunky forearms with fists, and
 * thin piston legs on flat foot pads. Model faces +Z with its feet at the origin.
 * Procedural geometry is merged per material → 4 draw calls per robot, with a cheaper LOD level
 * for distant robots. Geometry and materials are shared.
 */
export class RobotModelFactory {
  // Moderate metalness: without an environment map, highly metallic surfaces render almost black.
  private readonly bodyMaterial = new MeshStandardMaterial({ color: 0x6f8e98, metalness: 0.3, roughness: 0.45 });
  private readonly brassMaterial = new MeshStandardMaterial({ color: 0xb58d55, metalness: 0.55, roughness: 0.35 });
  private readonly darkMaterial = new MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.2, roughness: 0.7 });
  private high: MergedParts | null = null;
  private low: MergedParts | null = null;

  constructor(private readonly assets: AssetManager) {}

  create(glowMaterial: Material): Object3D {
    const gltf = this.assets.getModel('robot');
    if (gltf) {
      const root = gltf.scene.clone(true);
      root.traverse((o) => {
        if (o instanceof Mesh && /eye|visor|glow/i.test(o.name)) o.material = glowMaterial;
      });
      return root;
    }

    this.high ??= this.buildHigh();
    this.low ??= this.buildLow();
    const lod = new LOD();
    lod.addLevel(this.makeLevel(this.high, glowMaterial), 0);
    lod.addLevel(this.makeLevel(this.low, glowMaterial), LOD_DISTANCE);
    return lod;
  }

  private makeLevel(parts: MergedParts, glow: Material): Object3D {
    const body = new Mesh(parts.body, this.bodyMaterial);
    body.add(new Mesh(parts.brass, this.brassMaterial));
    body.add(new Mesh(parts.dark, this.darkMaterial));
    body.add(new Mesh(parts.glow, glow));
    return body;
  }

  private buildHigh(): MergedParts {
    const p: PartLists = { body: [], brass: [], dark: [], glow: [] };

    for (const s of [-1, 1]) {
      // ---------------------------------------------------------------- legs
      // Flat foot pad with a dark toe slot, brass ankle, twin piston shin, knee, thigh armour.
      p.body.push(box(0.24, 0.08, 0.34, 0.03).translate(s * 0.15, 0.04, 0.03));
      p.dark.push(box(0.1, 0.035, 0.05, 0.01).translate(s * 0.15, 0.04, 0.2));
      p.brass.push(new SphereGeometry(0.05, 12, 8).translate(s * 0.15, 0.12, 0));
      for (const o of [-0.022, 0.022]) {
        p.brass.push(new CylinderGeometry(0.018, 0.018, 0.33, 8).translate(s * 0.15 + o, 0.29, 0));
      }
      p.brass.push(new CylinderGeometry(0.035, 0.035, 0.08, 10).translate(s * 0.15, 0.3, 0));
      p.brass.push(new SphereGeometry(0.055, 12, 8).translate(s * 0.15, 0.47, 0));
      p.brass.push(new CylinderGeometry(0.026, 0.026, 0.3, 8).translate(s * 0.15, 0.62, 0));
      p.body.push(box(0.12, 0.24, 0.15, 0.04).translate(s * 0.2, 0.6, 0.01));
      p.brass.push(new CylinderGeometry(0.03, 0.03, 0.02, 10).rotateZ(Math.PI / 2).translate(s * 0.265, 0.6, 0.01));
      p.brass.push(new SphereGeometry(0.06, 12, 8).translate(s * 0.15, 0.79, 0));

      // ---------------------------------------------------------------- arms
      // Brass ball shoulder, short upper arm, chunky rounded forearm, brass fist with fingers.
      p.brass.push(new SphereGeometry(0.085, 14, 10).translate(s * 0.44, 1.42, 0));
      p.brass.push(new CylinderGeometry(0.045, 0.045, 0.2, 10).rotateZ(s * 0.25).translate(s * 0.49, 1.3, 0.02));
      p.body.push(box(0.18, 0.3, 0.21, 0.06).translate(s * 0.53, 1.08, 0.04));
      p.brass.push(new CylinderGeometry(0.035, 0.035, 0.02, 12).rotateZ(Math.PI / 2).translate(s * 0.625, 1.1, 0.04));
      p.dark.push(box(0.19, 0.02, 0.22, 0.008).translate(s * 0.53, 1.0, 0.04));
      p.brass.push(new SphereGeometry(0.075, 12, 8).scale(1, 0.85, 1).translate(s * 0.53, 0.89, 0.05));
      for (let f = 0; f < 4; f++) {
        const fx = s * 0.53 + (f - 1.5) * 0.034;
        p.brass.push(new CapsuleGeometry(0.018, 0.05, 3, 6).translate(fx, 0.84, 0.1));
        p.glow.push(new SphereGeometry(0.014, 6, 4).translate(fx, 0.8, 0.105));
      }

      // ---------------------------------------------------------------- torso details
      // Glowing side windows, shoulder bolts, belly bolts.
      p.glow.push(box(0.09, 0.22, 0.03, 0.012).rotateY(s * 0.35).translate(s * 0.27, 1.3, 0.265));
      p.brass.push(new CylinderGeometry(0.025, 0.025, 0.03, 8).translate(s * 0.28, 1.61, 0.12));
      p.brass.push(new CylinderGeometry(0.022, 0.022, 0.02, 8).rotateX(Math.PI / 2).translate(s * 0.26, 1.06, 0.25));
      // Waist cables from pelvis up into the belly.
      p.brass.push(new CylinderGeometry(0.014, 0.014, 0.22, 6).rotateZ(s * 0.45).translate(s * 0.075, 0.93, 0.03));

      // ---------------------------------------------------------------- head details
      // Brass-ringed glowing eyes and side ear bolts.
      p.brass.push(new TorusGeometry(0.052, 0.014, 8, 18).translate(s * 0.078, ROBOT_EYE_Y, 0.155));
      p.dark.push(new CylinderGeometry(0.05, 0.05, 0.01, 16).rotateX(Math.PI / 2).translate(s * 0.078, ROBOT_EYE_Y, 0.152));
      p.glow.push(new SphereGeometry(0.034, 12, 8).translate(s * 0.078, ROBOT_EYE_Y, 0.16));
      p.brass.push(new CylinderGeometry(0.04, 0.04, 0.05, 12).rotateZ(Math.PI / 2).translate(s * 0.18, 1.82, 0));
    }

    // ---------------------------------------------------------------- pelvis & spine
    p.body.push(box(0.36, 0.14, 0.22, 0.06).translate(0, 0.83, 0));
    p.brass.push(new CylinderGeometry(0.05, 0.06, 0.18, 12).translate(0, 0.95, 0));

    // ---------------------------------------------------------------- torso
    // Wide rounded barrel that tapers into a belly.
    p.body.push(box(0.8, 0.56, 0.54, 0.17).translate(0, 1.34, 0));
    p.body.push(new SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1.15, 0.55, 0.85).translate(0, 1.1, 0));
    p.dark.push(box(0.81, 0.02, 0.55, 0.01).translate(0, 1.52, 0));
    // Chest core: brass ring round a glowing lens.
    p.brass.push(new TorusGeometry(0.06, 0.018, 8, 20).translate(0, 1.24, 0.27));
    p.glow.push(new SphereGeometry(0.045, 12, 8).scale(1, 1, 0.6).translate(0, 1.24, 0.27));
    // Antenna from the rear left shoulder, tipped with a light.
    p.dark.push(new CylinderGeometry(0.007, 0.007, 0.5, 5).translate(-0.3, 1.82, -0.12));
    p.glow.push(new SphereGeometry(0.018, 6, 4).translate(-0.3, 2.08, -0.12));

    // ---------------------------------------------------------------- head
    p.brass.push(new CylinderGeometry(0.06, 0.07, 0.1, 12).translate(0, 1.63, 0));
    p.body.push(box(0.34, 0.3, 0.3, 0.07).translate(0, 1.81, 0));
    // Mouth grille.
    p.dark.push(box(0.2, 0.04, 0.03, 0.01).translate(0, 1.715, 0.145));
    p.brass.push(new CylinderGeometry(0.004, 0.004, 0.2, 4).rotateZ(Math.PI / 2).translate(0, 1.715, 0.162));
    // Wire bristles and a small lamp on top.
    const wires: ReadonlyArray<readonly [number, number, number]> = [
      [-0.06, -0.25, 0.05],
      [-0.02, -0.08, -0.1],
      [0.03, 0.15, 0.08],
    ];
    for (const [x, rz, rx] of wires) {
      p.dark.push(new CylinderGeometry(0.008, 0.008, 0.2, 4).translate(0, 0.1, 0).rotateZ(rz).rotateX(rx).translate(x, 1.95, -0.02));
    }
    p.brass.push(new CylinderGeometry(0.025, 0.025, 0.05, 8).translate(0.1, 1.98, 0.06));
    p.glow.push(new CylinderGeometry(0.02, 0.02, 0.02, 8).translate(0.1, 2.015, 0.06));

    return this.mergeAll(p);
  }

  private buildLow(): MergedParts {
    const p: PartLists = { body: [], brass: [], dark: [], glow: [] };
    for (const s of [-1, 1]) {
      p.body.push(new CylinderGeometry(0.12, 0.12, 0.08, 6).translate(s * 0.15, 0.04, 0.03));
      p.brass.push(new CylinderGeometry(0.035, 0.035, 0.75, 5).translate(s * 0.15, 0.45, 0));
      p.body.push(new CylinderGeometry(0.1, 0.1, 0.3, 6).translate(s * 0.53, 1.08, 0.04));
      p.brass.push(new SphereGeometry(0.08, 6, 4).translate(s * 0.44, 1.42, 0));
      p.glow.push(new SphereGeometry(0.04, 6, 4).translate(s * 0.078, ROBOT_EYE_Y, 0.16));
    }
    p.body.push(new CylinderGeometry(0.42, 0.3, 0.72, 10).scale(1, 1, 0.68).translate(0, 1.25, 0));
    p.body.push(new CylinderGeometry(0.17, 0.17, 0.3, 6).translate(0, 1.81, 0));
    p.dark.push(new CylinderGeometry(0.007, 0.007, 0.5, 3).translate(-0.3, 1.82, -0.12));
    p.glow.push(new SphereGeometry(0.05, 6, 4).translate(0, 1.24, 0.27));
    return this.mergeAll(p);
  }

  private mergeAll(p: PartLists): MergedParts {
    return { body: this.merge(p.body), brass: this.merge(p.brass), dark: this.merge(p.dark), glow: this.merge(p.glow) };
  }

  private merge(parts: BufferGeometry[]): BufferGeometry {
    // Normalise to non-indexed so every primitive has compatible attributes.
    const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const merged = mergeGeometries(flat, false);
    for (const g of parts) g.dispose();
    for (const g of flat) g.dispose();
    if (!merged) throw new Error('[RobotModelFactory] failed to merge geometry');
    merged.computeBoundingSphere();
    return merged;
  }

  dispose(): void {
    this.bodyMaterial.dispose();
    this.brassMaterial.dispose();
    this.darkMaterial.dispose();
    for (const p of [this.high, this.low]) {
      if (!p) continue;
      p.body.dispose();
      p.brass.dispose();
      p.dark.dispose();
      p.glow.dispose();
    }
  }
}
