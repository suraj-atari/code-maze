import {
  AnimationMixer,
  Box3,
  Group,
  LoopOnce,
  Vector3,
  type AnimationAction,
  type Object3D,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { damp } from '../utils/math';
import type { WeaponModels } from '../weapons/WeaponModels';
import type { AvatarPose, PlayerRig } from './PlayerRig';

const HEIGHT = 1.8;
const LOCOMOTION = ['idle', 'walk', 'run', 'crouch'] as const;
type Locomotion = (typeof LOCOMOTION)[number];

const CLIP_NAMES: Readonly<Record<Locomotion | 'swing' | 'throw', RegExp>> = {
  idle: /idle/i,
  walk: /walk/i,
  run: /run|sprint/i,
  crouch: /crouch|sneak/i,
  swing: /attack|swing|slash|smash/i,
  throw: /throw/i,
};
const HAND_BONE = /right.?hand$|hand.?r$|hand_r$|righthand/i;

/**
 * Player character from an authored GLB (registered as 'player' in the asset manifest).
 * The model is scaled to 1.8 m and turned to face -Z. Clips are matched by name
 * (idle / walk / run / crouch / attack / throw) and blended by speed; the sledgehammer is
 * attached to the right-hand bone if one is found.
 */
export class GltfPlayerRig implements PlayerRig {
  readonly root = new Group();
  readonly lampAnchor = new Group();
  private readonly mixer: AnimationMixer;
  private readonly loops = new Map<Locomotion, AnimationAction>();
  private readonly weights = new Map<Locomotion, number>();
  private readonly swingAction: AnimationAction | null;
  private readonly throwAction: AnimationAction | null;
  private readonly hammer: Object3D;

  constructor(gltf: GLTF, models: WeaponModels) {
    const model = cloneSkinned(gltf.scene);
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    const scale = size.y > 0 ? HEIGHT / size.y : 1;
    model.scale.setScalar(scale);
    const box = new Box3().setFromObject(model);
    model.position.y = -box.min.y;
    model.rotation.y = Math.PI; // glTF characters face +Z
    this.root.add(model);
    this.root.name = 'player-avatar';

    this.mixer = new AnimationMixer(model);
    const find = (re: RegExp) => gltf.animations.find((c) => re.test(c.name));
    for (const name of LOCOMOTION) {
      const clip = find(CLIP_NAMES[name]);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.setEffectiveWeight(name === 'idle' ? 1 : 0).play();
      this.loops.set(name, action);
      this.weights.set(name, name === 'idle' ? 1 : 0);
    }
    const once = (re: RegExp): AnimationAction | null => {
      const clip = find(re);
      if (!clip) return null;
      const a = this.mixer.clipAction(clip);
      a.setLoop(LoopOnce, 1);
      a.clampWhenFinished = false;
      return a;
    };
    this.swingAction = once(CLIP_NAMES.swing);
    this.throwAction = once(CLIP_NAMES.throw);

    // Sledgehammer in the right hand, compensating for the bone's world scale.
    this.hammer = models.hammer();
    let hand: Object3D | undefined;
    model.traverse((o) => {
      if (!hand && HAND_BONE.test(o.name)) hand = o;
    });
    this.root.updateMatrixWorld(true);
    if (hand) {
      const s = hand.getWorldScale(new Vector3());
      this.hammer.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
      hand.add(this.hammer);
    } else {
      this.hammer.position.set(0.28, 1.0, -0.1);
      this.root.add(this.hammer);
    }

    // Lamp at chest height; bone-independent so it always aims along the look pitch.
    this.lampAnchor.position.set(0.09, 1.38, -0.16);
    this.lampAnchor.rotation.order = 'YXZ';
    this.root.add(this.lampAnchor);
  }

  swing(): void {
    this.swingAction?.reset().play();
  }

  throwGrenade(): void {
    this.throwAction?.reset().play();
  }

  update(pose: Readonly<AvatarPose>, dt: number): void {
    const target: Locomotion =
      pose.speed < 0.25 ? 'idle' : pose.crouching ? 'crouch' : pose.sprinting ? 'run' : 'walk';
    const pick: Locomotion = this.loops.has(target) ? target : this.loops.has('walk') && target !== 'idle' ? 'walk' : 'idle';
    for (const [name, action] of this.loops) {
      const w = damp(this.weights.get(name) ?? 0, name === pick ? 1 : 0, 8, dt);
      this.weights.set(name, w);
      action.setEffectiveWeight(w);
    }
    this.hammer.visible = pose.hasHammer;
    this.lampAnchor.rotation.x = pose.pitch;
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
