import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { clamp, damp, lerp } from '../utils/math';
import type { WeaponModels } from '../weapons/WeaponModels';
import type { AvatarPose, PlayerRig } from './PlayerRig';

const HIP_Y = 1.03;
const SWING_SECONDS = 0.38;
const THROW_SECONDS = 0.5;
/** How quickly joints ease toward their targets (1/s): limbs react fast, the torso a bit slower. */
const LIMB_RATE = 22;
const BODY_RATE = 12;

/** Right arm + hammer wrist (shoulder pitch a, elbow b, hammer h) and whole-body follow-through. */
interface ArmKey {
  readonly a: number;
  readonly b: number;
  readonly h: number;
  readonly lean: number;
  readonly twist: number;
  /** Knee dip (hip drop, metres). */
  readonly dip: number;
}
// Hammer resting on the right shoulder, head behind it.
const CARRY: ArmKey = { a: 0.5, b: 1.9, h: -1.57, lean: 0, twist: 0, dip: 0 };
// Lifted further back: right shoulder turns back, body leans back.
const WINDUP: ArmKey = { a: 0.85, b: 2.0, h: -1.2, lean: 0.14, twist: -0.3, dip: 0 };
// Arm extended, head slammed down in front, body follows through and knees give.
const STRIKE: ArmKey = { a: 1.3, b: 0.15, h: -3.44, lean: -0.38, twist: 0.25, dip: 0.07 };

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const mixKey = (p: ArmKey, q: ArmKey, t: number): ArmKey => ({
  a: lerp(p.a, q.a, t),
  b: lerp(p.b, q.b, t),
  h: lerp(p.h, q.h, t),
  lean: lerp(p.lean, q.lean, t),
  twist: lerp(p.twist, q.twist, t),
  dip: lerp(p.dip, q.dip, t),
});

/** Damped spring for secondary motion (coat panels): overshoots and settles naturally. */
class Spring {
  value = 0;
  private velocity = 0;

  constructor(
    private readonly stiffness: number,
    private readonly damping: number,
  ) {}

  step(target: number, dt: number): number {
    // Sub-step so large frame times stay stable.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const accel = this.stiffness * (target - this.value) - this.damping * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}

/** Open, curved coat panel hinged at its top edge: a slice of a flared cone. */
function coatPanel(thetaStart: number, thetaLength: number, top: number, bottom: number, length: number): BufferGeometry {
  return new CylinderGeometry(top, bottom, length, 10, 1, true, thetaStart, thetaLength)
    .scale(1, 1, 0.68)
    .translate(0, -length / 2, 0);
}

/**
 * The player character built from rounded primitives on a joint hierarchy, with procedural
 * animation: gait with hip sway, shoulder counter-rotation and foot roll, joints that ease
 * instead of snapping, a spring-driven coat, lean into turns, and full-body hammer / throw moves.
 * Look: dark messy hair, long black leather trench coat over a grey shirt, glowing red collar,
 * dark trousers, combat boots, sci-fi sledgehammer carried on the shoulder.
 * Curved-cone angles: theta 0 = back (+Z), π = front (-Z), π/2 = the character's right (+X).
 */
export class ProceduralPlayerRig implements PlayerRig {
  readonly root = new Group();
  readonly lampAnchor = new Group();

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly skin = this.mat(0xc68d6e, 0.7, 0);
  private readonly hair = this.mat(0x0c0c0f, 0.6, 0);
  private readonly coat = this.mat(0x17191d, 0.42, 0.25, true);
  private readonly coatDark = this.mat(0x0d0e11, 0.5, 0.2, true);
  private readonly shirt = this.mat(0x4b4f55, 0.9, 0);
  private readonly pants = this.mat(0x1e2127, 0.85, 0);
  private readonly boots = this.mat(0x2a1f18, 0.55, 0.1);
  private readonly sole = this.mat(0x0b0b0b, 0.9, 0);
  private readonly leather = this.mat(0x2e2219, 0.6, 0.1);
  private readonly metal = this.mat(0x7c848d, 0.35, 0.7);
  private readonly collar = new MeshStandardMaterial({
    color: 0x4a0808,
    emissive: 0xff1a1a,
    emissiveIntensity: 1.6,
    roughness: 0.5,
  });
  private readonly eyes = new MeshBasicMaterial({ color: 0x0a0a0a });
  private readonly lens = new MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false });

  private readonly hips: Group;
  private readonly spine: Group;
  private readonly head: Group;
  private readonly shoulderL: Group;
  private readonly shoulderR: Group;
  private readonly elbowL: Group;
  private readonly elbowR: Group;
  private readonly thighL: Group;
  private readonly thighR: Group;
  private readonly kneeL: Group;
  private readonly kneeR: Group;
  private readonly ankleL: Group;
  private readonly ankleR: Group;
  private readonly hammer: Group;
  private readonly grenade: Object3D;
  private readonly skirtBack: Group;
  private readonly skirtFrontL: Group;
  private readonly skirtFrontR: Group;
  private readonly skirtSideL: Group;
  private readonly skirtSideR: Group;

  private readonly coatBack = new Spring(90, 9);
  private readonly coatFrontL = new Spring(140, 14);
  private readonly coatFrontR = new Spring(140, 14);
  private readonly coatSideL = new Spring(100, 10);
  private readonly coatSideR = new Spring(100, 10);
  private readonly coatFlare = new Spring(80, 8);

  private phase = 0;
  private move = 0;
  private run = 0;
  private crouch = 0;
  private turn = 0;
  private swingT = -1;
  private throwT = -1;

  constructor(models: WeaponModels) {
    this.materials.push(this.collar, this.eyes, this.lens);
    this.root.name = 'player-avatar';

    // ---------------------------------------------------------------- hips & legs
    this.hips = this.joint(this.root, 0, HIP_Y, 0);
    this.part(this.hips, new SphereGeometry(0.165, 16, 12).scale(1, 0.55, 0.66), this.pants, 0, 0, 0);
    this.part(this.hips, new CylinderGeometry(0.172, 0.172, 0.045, 24).scale(1, 1, 0.66), this.leather, 0, 0.07, 0);
    this.part(this.hips, new BoxGeometry(0.05, 0.035, 0.012), this.metal, 0, 0.07, -0.115);
    [this.thighL, this.kneeL, this.ankleL] = this.leg(-0.095);
    [this.thighR, this.kneeR, this.ankleR] = this.leg(0.095);

    // Coat skirt: five curved, flared panels hinged at the waist.
    const len = 0.68;
    this.skirtBack = this.joint(this.hips, 0, 0.06, 0);
    this.part(this.skirtBack, coatPanel(-0.95, 1.9, 0.185, 0.28, len), this.coat, 0, 0, 0);
    this.skirtSideL = this.joint(this.hips, 0, 0.06, 0);
    this.part(this.skirtSideL, coatPanel(-2.22, 1.3, 0.185, 0.28, len), this.coat, 0, 0, 0);
    this.skirtSideR = this.joint(this.hips, 0, 0.06, 0);
    this.part(this.skirtSideR, coatPanel(0.92, 1.3, 0.185, 0.28, len), this.coat, 0, 0, 0);
    this.skirtFrontL = this.joint(this.hips, 0, 0.06, 0);
    this.part(this.skirtFrontL, coatPanel(-2.92, 0.72, 0.185, 0.28, len), this.coat, 0, 0, 0);
    this.skirtFrontR = this.joint(this.hips, 0, 0.06, 0);
    this.part(this.skirtFrontR, coatPanel(2.2, 0.72, 0.185, 0.28, len), this.coat, 0, 0, 0);

    // ---------------------------------------------------------------- torso
    this.spine = this.joint(this.hips, 0, 0.08, 0);
    this.part(this.spine, new CapsuleGeometry(0.15, 0.28, 6, 16).scale(1, 1, 0.62), this.shirt, 0, 0.28, 0);
    // Coat body: a curved shell open at the front, sloping into the shoulders.
    const front = Math.PI;
    this.part(this.spine, new CylinderGeometry(0.195, 0.18, 0.5, 24, 1, true, front + 0.26, Math.PI * 2 - 0.52).scale(1, 1, 0.62), this.coat, 0, 0.29, 0);
    this.part(this.spine, new CylinderGeometry(0.075, 0.2, 0.1, 24, 1, true).scale(1, 1, 0.62), this.coat, 0, 0.585, 0);
    for (const s of [-1, 1]) {
      // Rounded shoulder caps hide the arm joints.
      this.part(this.spine, new SphereGeometry(0.066, 14, 10).scale(1, 0.8, 1), this.coat, s * 0.19, 0.505, 0);
      const lapel = this.part(this.spine, new BoxGeometry(0.06, 0.22, 0.02), this.coatDark, s * 0.075, 0.45, -0.118);
      lapel.rotation.z = s * 0.3;
    }
    this.part(this.spine, new CylinderGeometry(0.085, 0.1, 0.1, 16, 1, true, -1.9, 3.8).scale(1, 1, 0.8), this.coatDark, 0, 0.64, 0);
    this.part(this.spine, new CylinderGeometry(0.05, 0.056, 0.1, 12), this.skin, 0, 0.62, 0);
    // Glowing red collar / scarf knot.
    this.part(this.spine, new TorusGeometry(0.062, 0.024, 8, 20).rotateX(Math.PI / 2), this.collar, 0, 0.61, 0);
    this.part(this.spine, new SphereGeometry(0.04, 10, 8).scale(1.4, 0.9, 0.8), this.collar, 0, 0.58, -0.07);

    // ---------------------------------------------------------------- head
    this.head = this.joint(this.spine, 0, 0.67, 0);
    this.part(this.head, new SphereGeometry(0.105, 18, 14).scale(0.92, 1.08, 1), this.skin, 0, 0.1, 0);
    this.part(this.head, new SphereGeometry(0.075, 14, 10).scale(1, 0.75, 1), this.skin, 0, 0.045, -0.018);
    this.part(this.head, new BoxGeometry(0.022, 0.04, 0.03), this.skin, 0, 0.09, -0.103);
    for (const s of [-1, 1]) {
      this.part(this.head, new BoxGeometry(0.028, 0.012, 0.01), this.eyes, s * 0.038, 0.115, -0.097);
      const brow = this.part(this.head, new BoxGeometry(0.046, 0.013, 0.014), this.hair, s * 0.04, 0.137, -0.099);
      brow.rotation.z = s * 0.22; // inner ends lowered: a frown
      this.part(this.head, new SphereGeometry(0.022, 8, 6).scale(0.5, 1, 0.8), this.skin, s * 0.097, 0.1, 0.005);
    }
    // Hair cap tilted back so it covers the back of the head down to the nape.
    this.part(this.head, new SphereGeometry(0.114, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).rotateX(0.55), this.hair, 0, 0.1, 0.006);
    // Messy fringe: spikes swept forward.
    const spikes: ReadonlyArray<readonly [number, number, number, number, number]> = [
      [-0.055, 0.2, -0.05, -0.75, 0.35],
      [0, 0.215, -0.065, -0.85, 0],
      [0.055, 0.2, -0.045, -0.7, -0.35],
      [-0.03, 0.225, 0.01, -0.35, 0.25],
      [0.035, 0.225, 0.02, -0.3, -0.2],
      [-0.075, 0.17, 0.04, 0.2, 0.7],
      [0.075, 0.17, 0.04, 0.2, -0.7],
    ];
    const spike = new ConeGeometry(0.035, 0.11, 6);
    for (const [x, y, z, rx, rz] of spikes) this.part(this.head, spike, this.hair, x, y, z).rotation.set(rx, 0, rz);

    // ---------------------------------------------------------------- arms
    [this.shoulderL, this.elbowL] = this.arm(-1);
    [this.shoulderR, this.elbowR] = this.arm(1);
    const handR = this.elbowR.children.find((c) => c.name === 'hand')!;
    const handL = this.elbowL.children.find((c) => c.name === 'hand')!;
    this.hammer = this.joint(handR, 0, -0.035, 0);
    this.hammer.add(models.hammer());
    this.grenade = models.grenade();
    this.grenade.position.y = -0.06;
    this.grenade.visible = false;
    handL.add(this.grenade);

    // ---------------------------------------------------------------- chest lamp
    const lampMount = this.joint(this.spine, 0.085, 0.4, -0.13);
    this.part(lampMount, new BoxGeometry(0.07, 0.048, 0.04), this.metal, 0, 0, 0);
    this.part(lampMount, new CylinderGeometry(0.018, 0.018, 0.012, 12).rotateX(Math.PI / 2), this.lens, 0, 0, -0.022);
    this.lampAnchor.rotation.order = 'YXZ';
    lampMount.add(this.lampAnchor);

    this.update({ speed: 0, sprinting: false, crouching: false, pitch: 0, hasHammer: false, lamp: 0, turnRate: 0 }, 1, 0);
  }

  swing(): void {
    this.swingT = 0;
  }

  throwGrenade(): void {
    this.throwT = 0;
  }

  update(pose: Readonly<AvatarPose>, dt: number, time: number): void {
    this.move = damp(this.move, pose.speed > 0.25 ? 1 : 0, 6, dt);
    this.run = damp(this.run, pose.sprinting ? 1 : 0, 5, dt);
    this.crouch = damp(this.crouch, pose.crouching ? 1 : 0, 8, dt);
    this.turn = damp(this.turn, clamp(pose.turnRate, -6, 6), 8, dt);
    const stride = pose.sprinting ? 2.4 : pose.crouching ? 1.2 : 1.7;
    this.phase += (pose.speed * dt * Math.PI * 2) / stride;

    const m = this.move;
    const r = this.run;
    const c = this.crouch;
    const sw = Math.sin(this.phase);
    const cw = Math.cos(this.phase);
    const idle = 1 - m;

    // ---------------------------------------------------------------- legs
    // Thighs swing opposite each other; knees fold on the forward (recovery) swing; the ankle
    // keeps the boot flat on the ground and rolls onto the toes as the leg pushes off.
    const legAmp = (0.42 + 0.16 * r - 0.15 * c) * m;
    const kneeAmp = (0.6 + 0.9 * r) * m;
    const thighL = sw * legAmp + c * 0.95;
    const thighR = -sw * legAmp + c * 0.95;
    const kneeL = -(0.08 * m + Math.max(0, cw) * kneeAmp) - c * 1.55;
    const kneeR = -(0.08 * m + Math.max(0, -cw) * kneeAmp) - c * 1.55;
    this.ease(this.thighL, thighL, 0, 0, LIMB_RATE, dt);
    this.ease(this.thighR, thighR, 0, 0, LIMB_RATE, dt);
    this.ease(this.kneeL, kneeL, 0, 0, LIMB_RATE, dt);
    this.ease(this.kneeR, kneeR, 0, 0, LIMB_RATE, dt);
    this.ease(this.ankleL, -(thighL + kneeL) * 0.85 - Math.max(0, -sw) * 0.3 * m, 0, 0, LIMB_RATE, dt);
    this.ease(this.ankleR, -(thighR + kneeR) * 0.85 - Math.max(0, sw) * 0.3 * m, 0, 0, LIMB_RATE, dt);

    // ---------------------------------------------------------------- body
    // Hip sway toward the stance leg, lean into turns, idle weight shifts; the shoulders
    // counter-rotate against the hips and the head stays level.
    const turnLean = clamp(this.turn * 0.05 * (0.3 + m), -0.18, 0.18);
    const hipRoll = sw * 0.05 * m + Math.sin(time * 0.8) * 0.025 * idle + turnLean;
    let lean = -(0.06 + 0.22 * r) * m - c * 0.35 + Math.sin(time * 1.6) * 0.012 * idle;
    let twist = sw * 0.12 * m;
    let dip = 0;

    // ---------------------------------------------------------------- left arm (+ throw)
    const armAmp = (0.35 + 0.45 * r) * m;
    let la = -sw * armAmp + 0.05 + c * 0.2;
    let lb = 0.18 + 0.3 * m + 0.8 * r * m + c * 0.45 + Math.max(0, la) * 0.5;
    if (this.throwT >= 0) {
      this.throwT += dt;
      const t = this.throwT / THROW_SECONDS;
      if (t < 0.35) {
        const k = smoothstep(t / 0.35);
        la = lerp(la, -0.9, k);
        lb = lerp(lb, 1.3, k);
        twist += 0.3 * k;
      } else if (t < 0.6) {
        const k = smoothstep((t - 0.35) / 0.25);
        la = lerp(-0.9, 2.3, k);
        lb = lerp(1.3, 0.1, k);
        twist += lerp(0.3, -0.3, k);
        lean -= 0.12 * k;
      } else {
        const k = smoothstep(Math.min(1, (t - 0.6) / 0.4));
        la = lerp(2.3, la, k);
        lb = lerp(0.1, lb, k);
        twist -= 0.3 * (1 - k);
        lean -= 0.12 * (1 - k);
      }
      this.grenade.visible = t < 0.5;
      if (t >= 1) this.throwT = -1;
    }
    const throwing = this.throwT >= 0;
    this.ease(this.shoulderL, la, 0, -0.1 - 0.05 * r * m, throwing ? 40 : LIMB_RATE, dt);
    this.ease(this.elbowL, lb, 0, 0, throwing ? 40 : LIMB_RATE, dt);

    // ---------------------------------------------------------------- right arm (+ hammer)
    this.hammer.visible = pose.hasHammer;
    const freeA = sw * armAmp + 0.05 + c * 0.2;
    let key: ArmKey = pose.hasHammer
      ? { ...CARRY, a: CARRY.a + sw * 0.08 * m }
      : { a: freeA, b: 0.18 + 0.3 * m + 0.8 * r * m + c * 0.45 + Math.max(0, freeA) * 0.5, h: CARRY.h, lean: 0, twist: 0, dip: 0 };
    if (this.swingT >= 0) {
      this.swingT += dt;
      const t = this.swingT / SWING_SECONDS;
      if (t < 0.3) key = mixKey(key, WINDUP, smoothstep(t / 0.3));
      else if (t < 0.55) key = mixKey(WINDUP, STRIKE, ((t - 0.3) / 0.25) ** 2);
      else key = mixKey(STRIKE, key, smoothstep(Math.min(1, (t - 0.55) / 0.45)));
      if (t >= 1) this.swingT = -1;
    }
    // The swing is keyframed already, so it tracks tightly; the carry pose eases.
    const armRate = this.swingT >= 0 ? 60 : LIMB_RATE;
    this.ease(this.shoulderR, key.a, 0, 0.1 + 0.05 * r * m, armRate, dt);
    this.ease(this.elbowR, key.b, 0, 0, armRate, dt);
    this.hammer.rotation.x = key.h;
    lean += key.lean;
    twist += key.twist;
    dip += key.dip;

    // ---------------------------------------------------------------- apply body
    const bob = -Math.abs(sw) * 0.035 * m * (1 + r) + 0.02 * m;
    this.hips.position.y = damp(this.hips.position.y, HIP_Y - c * 0.38 + bob - dip, 18, dt);
    this.ease(this.hips, 0, -sw * 0.08 * m, hipRoll, BODY_RATE, dt);
    this.ease(this.spine, lean, twist, -hipRoll * 0.7, this.swingT >= 0 ? 40 : BODY_RATE, dt);
    const s = this.spine.rotation;
    this.ease(
      this.head,
      clamp(pose.pitch * 0.6, -0.5, 0.5) - s.x * 0.7,
      -s.y * 0.7,
      -(this.hips.rotation.z + s.z) * 0.8,
      BODY_RATE,
      dt,
    );

    // ---------------------------------------------------------------- coat (springs)
    // Trails behind when moving, swings out in turns, front panels follow the thighs, and
    // everything overshoots a little and settles like heavy leather.
    const trail = -(0.1 + 0.3 * r) * m;
    const flutter = Math.sin(time * 11) * 0.04 * m * (0.5 + r);
    this.skirtBack.rotation.x = this.coatBack.step(trail + flutter - c * 0.1, dt);
    this.skirtFrontL.rotation.x = this.coatFrontL.step(clamp(this.thighL.rotation.x * 0.8, 0.04, 0.7), dt);
    this.skirtFrontR.rotation.x = this.coatFrontR.step(clamp(this.thighR.rotation.x * 0.8, 0.04, 0.7), dt);
    this.skirtSideL.rotation.x = this.coatSideL.step(trail * 0.5 + this.thighL.rotation.x * 0.2, dt);
    this.skirtSideR.rotation.x = this.coatSideR.step(trail * 0.5 + this.thighR.rotation.x * 0.2, dt);
    const flare = this.coatFlare.step(0.03 + 0.05 * r * m + Math.abs(this.turn) * 0.012, dt);
    this.skirtSideL.rotation.z = -flare + turnLean * 0.25;
    this.skirtSideR.rotation.z = flare + turnLean * 0.25;

    // ---------------------------------------------------------------- lamp
    // The chest lamp aims exactly along the look pitch, whatever the torso is doing.
    this.lampAnchor.rotation.x = pose.pitch - s.x;
    this.lampAnchor.rotation.y = -s.y;
    const glow = 0.12 + 0.88 * clamp(pose.lamp, 0, 1);
    this.lens.color.setRGB(glow, glow * 0.95, glow * 0.84);
  }

  // ------------------------------------------------------------------ building helpers

  /** Frame-rate independent easing of a joint's rotation toward a target. */
  private ease(o: Object3D, x: number, y: number, z: number, rate: number, dt: number): void {
    const k = 1 - Math.exp(-rate * dt);
    const r = o.rotation;
    r.set(r.x + (x - r.x) * k, r.y + (y - r.y) * k, r.z + (z - r.z) * k);
  }

  private leg(x: number): [Group, Group, Group] {
    const thigh = this.joint(this.hips, x, -0.03, 0);
    this.part(thigh, new CapsuleGeometry(0.072, 0.33, 6, 12).translate(0, -0.225, 0), this.pants, 0, 0, 0);
    const knee = this.joint(thigh, 0, -0.45, 0);
    this.part(knee, new CapsuleGeometry(0.058, 0.32, 6, 12).translate(0, -0.215, 0), this.pants, 0, 0, 0);
    const ankle = this.joint(knee, 0, -0.44, 0);
    this.part(ankle, new CylinderGeometry(0.064, 0.07, 0.16, 12), this.boots, 0, 0.04, 0);
    this.part(ankle, new CapsuleGeometry(0.056, 0.13, 4, 10).rotateX(Math.PI / 2).scale(1.05, 0.8, 1), this.boots, 0, -0.06, -0.045);
    this.part(ankle, new BoxGeometry(0.115, 0.025, 0.26), this.sole, 0, -0.1, -0.045);
    return [thigh, knee, ankle];
  }

  /** @param side -1 left, 1 right */
  private arm(side: number): [Group, Group] {
    const shoulder = this.joint(this.spine, side * 0.2, 0.5, 0);
    this.part(shoulder, new CapsuleGeometry(0.058, 0.2, 6, 12).translate(0, -0.15, 0), this.coat, 0, 0, 0);
    const elbow = this.joint(shoulder, 0, -0.3, 0);
    this.part(elbow, new CapsuleGeometry(0.05, 0.18, 6, 12).translate(0, -0.13, 0), this.coat, 0, 0, 0);
    this.part(elbow, new CylinderGeometry(0.057, 0.062, 0.05, 12, 1, true), this.coatDark, 0, -0.24, 0);
    const hand = this.joint(elbow, 0, -0.29, 0);
    hand.name = 'hand';
    this.part(hand, new SphereGeometry(0.045, 12, 10).scale(0.8, 1.1, 0.9), this.skin, 0, -0.03, 0);
    const thumb = this.part(hand, new CapsuleGeometry(0.014, 0.03, 4, 6), this.skin, -side * 0.03, -0.02, -0.025);
    thumb.rotation.z = side * 0.6;
    return [shoulder, elbow];
  }

  private joint(parent: Object3D, x: number, y: number, z: number): Group {
    const g = new Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  private part(parent: Object3D, geo: BufferGeometry, mat: Material, x: number, y: number, z: number): Mesh {
    if (!this.geometries.includes(geo)) this.geometries.push(geo);
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /** @param doubleSided for open shells (coat) that are seen from inside too */
  private mat(color: number, roughness: number, metalness: number, doubleSided = false): MeshStandardMaterial {
    const m = new MeshStandardMaterial({ color, roughness, metalness, side: doubleSided ? DoubleSide : FrontSide });
    this.materials.push(m);
    return m;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
