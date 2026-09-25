import {
  AdditiveBlending,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Scene,
} from 'three';

const COLOR = 0x2fd8ff;

/** "Go here" marker for the tutorial: a soft light column, a floor ring and a bobbing arrow. */
export class TutorialBeacon {
  private readonly root = new Group();
  private readonly arrow: Mesh;
  private readonly beamMaterial = new MeshBasicMaterial({
    color: COLOR,
    transparent: true,
    opacity: 0.16,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
  });
  private readonly solidMaterial = new MeshBasicMaterial({ color: COLOR, toneMapped: false });
  private readonly beam = new CylinderGeometry(0.4, 0.4, 3, 24, 1, true);
  private readonly ring = new RingGeometry(0.42, 0.55, 32);
  private readonly cone = new ConeGeometry(0.16, 0.32, 4);

  constructor(scene: Scene) {
    this.root.name = 'tutorial-beacon';
    const beam = new Mesh(this.beam, this.beamMaterial);
    beam.position.y = 1.5;
    const ring = new Mesh(this.ring, this.solidMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.arrow = new Mesh(this.cone, this.solidMaterial);
    this.arrow.rotation.x = Math.PI;
    this.root.add(beam, ring, this.arrow);
    this.root.visible = false;
    scene.add(this.root);
  }

  show(x: number, z: number): void {
    this.root.position.set(x, 0, z);
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
  }

  update(time: number): void {
    if (!this.root.visible) return;
    this.arrow.position.y = 2.1 + Math.sin(time * 3) * 0.12;
    this.arrow.rotation.y = time * 1.5;
    this.beamMaterial.opacity = 0.12 + 0.06 * Math.sin(time * 2.5);
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of [this.beam, this.ring, this.cone]) g.dispose();
    this.beamMaterial.dispose();
    this.solidMaterial.dispose();
  }
}
