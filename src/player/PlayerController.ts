import type { PlayerConfig } from '../config/types';
import type {
  CharacterController,
  Collider,
  PhysicsSystem,
  RigidBody,
} from '../physics/PhysicsSystem';

/**
 * Physical body of the player: a kinematic capsule moved by Rapier's character controller,
 * which handles sliding along walls. `position` is the feet position.
 */
export class PlayerController {
  readonly position = { x: 0, y: 0, z: 0 };
  grounded = false;
  private body: RigidBody | null = null;
  private collider: Collider | null = null;
  private controller: CharacterController | null = null;
  private verticalVelocity = 0;
  private readonly desired = { x: 0, y: 0, z: 0 };
  private readonly next = { x: 0, y: 0, z: 0 };
  private readonly centerOffset: number;

  constructor(
    private readonly physics: PhysicsSystem,
    private readonly config: PlayerConfig,
  ) {
    this.centerOffset = config.halfHeight + config.radius;
  }

  spawn(x: number, z: number): void {
    this.despawn();
    const { body, collider } = this.physics.createKinematicCapsule(
      x,
      this.centerOffset + 0.02,
      z,
      this.config.halfHeight,
      this.config.radius,
    );
    this.body = body;
    this.collider = collider;
    this.controller = this.physics.createCharacterController(0.02);
    this.verticalVelocity = 0;
    this.position.x = x;
    this.position.y = 0;
    this.position.z = z;
  }

  /** Moves by a horizontal displacement (metres), applying gravity and collisions. */
  move(dx: number, dz: number, dt: number): void {
    if (!this.body || !this.collider || !this.controller) return;
    this.verticalVelocity = this.grounded ? -1 : this.verticalVelocity - this.config.gravity * dt;

    this.desired.x = dx;
    this.desired.y = this.verticalVelocity * dt;
    this.desired.z = dz;
    this.controller.computeColliderMovement(this.collider, this.desired);
    const mv = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    const t = this.body.translation();
    this.next.x = t.x + mv.x;
    this.next.y = t.y + mv.y;
    this.next.z = t.z + mv.z;
    this.body.setNextKinematicTranslation(this.next);

    this.position.x = this.next.x;
    this.position.y = this.next.y - this.centerOffset;
    this.position.z = this.next.z;
  }

  despawn(): void {
    if (this.controller) this.physics.removeCharacterController(this.controller);
    if (this.body) this.physics.removeBody(this.body);
    this.controller = null;
    this.body = null;
    this.collider = null;
  }
}
