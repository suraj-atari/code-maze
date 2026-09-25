import { Color, Group, MeshBasicMaterial, Object3D, SpotLight } from 'three';
import type { RobotConfig } from '../config/types';
import type { RobotStateId } from '../core/types';
import { DEG2RAD } from '../utils/math';
import { ROBOT_EYE_Y, type RobotModelFactory } from './RobotModelFactory';

/** Visual representation of one robot: model, glowing eye/visor tinted by AI state, scan light. */
export class RobotView {
  readonly root = new Group();
  private readonly model: Object3D;
  private readonly glowMaterial = new MeshBasicMaterial({ color: 0x2fd8ff, toneMapped: false });
  private readonly light: SpotLight | null;
  private readonly color = new Color(0x2fd8ff);
  private readonly targetColor = new Color();
  private phaseOffset: number;
  private static readonly STUN_COLOR = new Color(0x9a5cff);

  constructor(factory: RobotModelFactory, config: RobotConfig, withLight: boolean, id: number) {
    this.root.name = `robot-${id}`;
    this.phaseOffset = id * 1.37;
    this.model = factory.create(this.glowMaterial);
    this.root.add(this.model);

    if (withLight) {
      const l = config.eyeLight;
      this.light = new SpotLight(0x2fd8ff, l.intensity, l.range, l.angleDeg * DEG2RAD, 0.6, 2);
      this.light.position.set(0, ROBOT_EYE_Y, 0.2);
      this.light.target.position.set(0, 0.2, 4);
      this.light.castShadow = false;
      this.root.add(this.light, this.light.target);
    } else {
      this.light = null;
    }
    this.root.visible = false;
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  update(
    x: number,
    z: number,
    heading: number,
    state: RobotStateId,
    config: RobotConfig,
    time: number,
    dt: number,
    /** Seconds of paralysis left (0 = not stunned). */
    stun: number,
  ): void {
    if (stun > 0) {
      // Paralysed: slumped forward, glow flickers violet like a shorted circuit.
      this.root.position.set(x, 0, z);
      this.root.rotation.set(0.18, heading, Math.sin(time * 31) * 0.02);
      const flicker = Math.sin(time * 40) > 0.3 || stun < 0.6 ? 0.25 : 1;
      this.color.copy(RobotView.STUN_COLOR).multiplyScalar(flicker);
      this.glowMaterial.color.copy(this.color);
      if (this.light) {
        this.light.color.copy(this.color);
        this.light.intensity = config.eyeLight.intensity * 0.3 * flicker;
      }
      return;
    }
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    const chasing = state === 'chase';
    // Walker on legs: a gentle stomp bob that never sinks the feet below the floor.
    const bob = Math.abs(Math.sin(time * (chasing ? 7 : 3) + this.phaseOffset)) * 0.03;
    this.root.position.set(x, bob, z);
    this.root.rotation.y = heading;

    this.targetColor.setHex(config.stateColors[state]);
    this.color.lerp(this.targetColor, 1 - Math.exp(-8 * dt));
    this.glowMaterial.color.copy(this.color);
    if (this.light) {
      this.light.color.copy(this.color);
      const pulse = chasing ? 0.75 + 0.25 * Math.sin(time * 14) : 1;
      this.light.intensity = config.eyeLight.intensity * (chasing ? 1.4 : 1) * pulse;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.glowMaterial.dispose();
    this.light?.dispose();
  }
}
