import type * as RapierModule from '@dimforge/rapier3d-compat';

type Rapier = (typeof RapierModule)['default'];
export type RigidBody = RapierModule.RigidBody;
export type Collider = RapierModule.Collider;
export type CharacterController = RapierModule.KinematicCharacterController;

export interface KinematicCapsule {
  readonly body: RigidBody;
  readonly collider: Collider;
}

/**
 * Thin wrapper around a Rapier world. Game code never touches RAPIER directly, which keeps the
 * physics backend swappable and the rest of the code free of WASM lifetime concerns.
 */
export class PhysicsSystem {
  private readonly world: RapierModule.World;

  private constructor(private readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
  }

  /**
   * Rapier ships as (large) WASM, so it is imported dynamically: it becomes its own cacheable
   * chunk that downloads while the loading screen is visible.
   */
  static async create(): Promise<PhysicsSystem> {
    const R = (await import('@dimforge/rapier3d-compat')).default;
    await R.init();
    return new PhysicsSystem(R);
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  createFixedBody(x = 0, y = 0, z = 0): RigidBody {
    return this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(x, y, z));
  }

  /** Adds a box collider (half extents) to `body`, offset in body space. */
  addBox(body: RigidBody, hx: number, hy: number, hz: number, x: number, y: number, z: number): Collider {
    const desc = this.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0);
    return this.world.createCollider(desc, body);
  }

  createKinematicCapsule(x: number, y: number, z: number, halfHeight: number, radius: number): KinematicCapsule {
    const body = this.world.createRigidBody(
      this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z),
    );
    const collider = this.world.createCollider(this.R.ColliderDesc.capsule(halfHeight, radius), body);
    return { body, collider };
  }

  createCharacterController(offset: number): CharacterController {
    const controller = this.world.createCharacterController(offset);
    controller.setApplyImpulsesToDynamicBodies(false);
    controller.enableSnapToGround(0.3);
    controller.setSlideEnabled(true);
    return controller;
  }

  removeCharacterController(controller: CharacterController): void {
    this.world.removeCharacterController(controller);
  }

  removeBody(body: RigidBody): void {
    this.world.removeRigidBody(body);
  }

  get bodyCount(): number {
    return this.world.bodies.len();
  }

  get colliderCount(): number {
    return this.world.colliders.len();
  }

  /** Line segment buffers of every collider (debug only — allocates). */
  debugBuffers(): { vertices: Float32Array; colors: Float32Array } {
    return this.world.debugRender();
  }
}
