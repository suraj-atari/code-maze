import type { Object3D, Scene } from 'three';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { wrapAngle } from '../utils/math';
import type { Player } from './Player';
import type { PlayerModelFactory } from './PlayerModelFactory';
import type { AvatarPose, PlayerRig } from './PlayerRig';

/** The player's visible body for the third-person view: follows the Player and animates. */
export class PlayerAvatar {
  private readonly rig: PlayerRig;
  private readonly pose: AvatarPose = {
    speed: 0,
    sprinting: false,
    crouching: false,
    pitch: 0,
    hasHammer: false,
    lamp: 0,
    turnRate: 0,
  };
  private lastYaw: number | null = null;

  constructor(scene: Scene, factory: PlayerModelFactory, events: EventBus<GameEvents>) {
    this.rig = factory.create();
    this.rig.root.visible = false;
    scene.add(this.rig.root);
    events.on('weapon:hammerSwing', () => this.rig.swing());
    events.on('weapon:grenadeThrown', () => this.rig.throwGrenade());
  }

  get lampAnchor(): Object3D {
    return this.rig.lampAnchor;
  }

  setVisible(visible: boolean): void {
    this.rig.root.visible = visible;
  }

  update(dt: number, time: number, player: Player, hasHammer: boolean): void {
    const root = this.rig.root;
    const p = player.position;
    root.position.set(p.x, p.y, p.z);
    root.rotation.y = player.yaw;
    const pose = this.pose;
    pose.speed = player.speed;
    pose.sprinting = player.sprinting;
    pose.crouching = player.crouching;
    pose.pitch = player.pitch;
    pose.hasHammer = hasHammer;
    pose.lamp = player.lamp.output;
    pose.turnRate = this.lastYaw === null || dt <= 0 ? 0 : wrapAngle(player.yaw - this.lastYaw) / dt;
    this.lastYaw = player.yaw;
    this.rig.update(pose, dt, time);
  }

  dispose(): void {
    this.rig.dispose();
  }
}
