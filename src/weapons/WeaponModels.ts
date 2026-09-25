import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

/** Studio-style lit sphere for matcap shading (key light top-left). */
function makeMatcap(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(46, 40, 4, 64, 64, 64);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, '#9a9a9a');
  g.addColorStop(0.8, '#3a3a3a');
  g.addColorStop(1, '#141414');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface ViewMaterial {
  readonly material: MeshMatcapMaterial;
  readonly base: Color;
}

/**
 * Procedural hammer and grenade meshes. Geometry and materials are built once and shared by
 * every instance (first-person view model, armory displays, thrown grenades).
 * Hammer: a sci-fi sledge. Handle along +Y from the grip (origin), cylindrical head across Z at
 * the top with glowing orange striking faces on both ends.
 * Grenade: centred on the origin, fuse cap on +Y.
 * The first-person hammer uses unlit matcap materials: it sits right in front of the lamp, whose
 * point-blank spotlight would otherwise blow it out to white.
 */
export class WeaponModels {
  private readonly geometries: BufferGeometry[] = [];
  private readonly shaft = new MeshStandardMaterial({ color: 0x3a3430, roughness: 0.55, metalness: 0.4, emissive: 0x0a0806 });
  private readonly grip = new MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.9, metalness: 0.1, emissive: 0x050505 });
  private readonly steel = new MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.32, metalness: 0.7, emissive: 0x16191c });
  private readonly darkSteel = new MeshStandardMaterial({ color: 0x3b4148, roughness: 0.4, metalness: 0.75, emissive: 0x0b0d10 });
  private readonly copper = new MeshStandardMaterial({ color: 0xb8702e, roughness: 0.35, metalness: 0.8, emissive: 0x2a1204 });
  /** Unlit orange glow of the sledge faces and bands. */
  private readonly glow = new MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false });
  private readonly olive = new MeshStandardMaterial({ color: 0x4f5c32, roughness: 0.6, metalness: 0.25, emissive: 0x0c0f06 });
  /** Shared by every grenade so one assignment blinks them all. */
  readonly ledMaterial = new MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  private readonly matcap = makeMatcap();
  private readonly viewShaft = this.viewMaterial(0x6a625a);
  private readonly viewGrip = this.viewMaterial(0x2a2e34);
  private readonly viewSteel = this.viewMaterial(0xc4ccd4);
  private readonly viewDarkSteel = this.viewMaterial(0x6a727c);
  private readonly viewCopper = this.viewMaterial(0xd08a44);

  private readonly handleGeo = this.geo(new CylinderGeometry(0.02, 0.023, 0.92, 10).translate(0, 0.34, 0));
  private readonly gripGeo = this.geo(new CylinderGeometry(0.027, 0.027, 0.24, 10).translate(0, 0.02, 0));
  private readonly pommelGeo = this.geo(new CylinderGeometry(0.03, 0.024, 0.05, 10).translate(0, -0.13, 0));
  private readonly bandGeo = this.geo(new CylinderGeometry(0.026, 0.026, 0.026, 10));
  private readonly neckGeo = this.geo(new CylinderGeometry(0.036, 0.03, 0.08, 10).translate(0, 0.76, 0));
  private readonly headGeo = this.geo(new CylinderGeometry(0.07, 0.07, 0.26, 16).rotateX(Math.PI / 2).translate(0, 0.84, 0));
  private readonly capGeo2 = this.geo(new CylinderGeometry(0.086, 0.086, 0.05, 16).rotateX(Math.PI / 2));
  private readonly ringGeo = this.geo(new TorusGeometry(0.07, 0.011, 6, 20));
  private readonly faceGeo = this.geo(new CylinderGeometry(0.042, 0.042, 0.052, 12).rotateX(Math.PI / 2));
  private readonly blockGeo = this.geo(new BoxGeometry(0.05, 0.1, 0.12).translate(0, 0.84, 0));

  private readonly bodyGeo = this.geo(new SphereGeometry(0.08, 14, 10).scale(1, 1.18, 1));
  private readonly ridgeGeo = this.geo(new TorusGeometry(0.081, 0.009, 6, 20).rotateX(Math.PI / 2));
  private readonly capGeo = this.geo(new CylinderGeometry(0.028, 0.034, 0.05, 10).translate(0, 0.108, 0));
  private readonly leverGeo = this.geo(new BoxGeometry(0.022, 0.13, 0.014).rotateZ(-0.18).translate(0.045, 0.06, 0));
  private readonly pinGeo = this.geo(new TorusGeometry(0.022, 0.005, 6, 14).translate(-0.04, 0.12, 0));
  private readonly ledGeo = this.geo(new SphereGeometry(0.012, 6, 4).translate(0, 0.137, 0));

  /** @param firstPerson use the view-model (matcap) materials */
  hammer(firstPerson = false): Object3D {
    const v = firstPerson;
    const shaft: Material = v ? this.viewShaft.material : this.shaft;
    const grip: Material = v ? this.viewGrip.material : this.grip;
    const steel: Material = v ? this.viewSteel.material : this.steel;
    const dark: Material = v ? this.viewDarkSteel.material : this.darkSteel;
    const copper: Material = v ? this.viewCopper.material : this.copper;
    const g = new Group();
    g.name = 'hammer';
    g.add(
      new Mesh(this.handleGeo, shaft),
      new Mesh(this.gripGeo, grip),
      new Mesh(this.pommelGeo, steel),
      new Mesh(this.neckGeo, steel),
      new Mesh(this.headGeo, dark),
      new Mesh(this.blockGeo, steel),
    );
    for (const y of [0.2, 0.45, 0.64]) g.add(this.at(new Mesh(this.bandGeo, copper), 0, y, 0));
    for (const side of [-1, 1]) {
      g.add(
        this.at(new Mesh(this.capGeo2, steel), 0, 0.84, side * 0.14),
        this.at(new Mesh(this.ringGeo, this.glow), 0, 0.84, side * 0.12),
        this.at(new Mesh(this.faceGeo, this.glow), 0, 0.84, side * 0.155),
      );
    }
    return g;
  }

  private at(o: Mesh, x: number, y: number, z: number): Mesh {
    o.position.set(x, y, z);
    return o;
  }

  /** 0..1 — dims the first-person hammer with the lamp so it doesn't glow in the dark. */
  setViewBrightness(b: number): void {
    for (const v of this.viewMaterials()) v.material.color.copy(v.base).multiplyScalar(b);
  }

  grenade(): Object3D {
    const g = new Group();
    g.name = 'grenade';
    const ridgeTop = new Mesh(this.ridgeGeo, this.olive);
    ridgeTop.position.y = 0.035;
    const ridgeBottom = new Mesh(this.ridgeGeo, this.olive);
    ridgeBottom.position.y = -0.035;
    g.add(
      new Mesh(this.bodyGeo, this.olive),
      ridgeTop,
      ridgeBottom,
      new Mesh(this.capGeo, this.steel),
      new Mesh(this.leverGeo, this.steel),
      new Mesh(this.pinGeo, this.steel),
      new Mesh(this.ledGeo, this.ledMaterial),
    );
    return g;
  }

  private viewMaterials(): ViewMaterial[] {
    return [this.viewShaft, this.viewGrip, this.viewSteel, this.viewDarkSteel, this.viewCopper];
  }

  private viewMaterial(hex: number): ViewMaterial {
    return { material: new MeshMatcapMaterial({ matcap: this.matcap, color: hex, fog: false }), base: new Color(hex) };
  }

  private geo<T extends BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of [this.shaft, this.grip, this.steel, this.darkSteel, this.copper, this.glow, this.olive, this.ledMaterial]) {
      m.dispose();
    }
    for (const v of this.viewMaterials()) v.material.dispose();
    this.matcap.dispose();
  }
}
