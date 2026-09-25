import { PointLight, SpotLight, type Object3D, type PerspectiveCamera } from 'three';
import type { GraphicsQuality, LampConfig } from '../config/types';
import { DEG2RAD } from '../utils/math';

/**
 * Renders the player's lamp: a shadow-casting spot light mounted just below/right of the eyes,
 * plus a very faint close-range fill so the player's surroundings aren't pure black next to the
 * beam. Always present in the scene (only intensity changes) to keep the light count constant.
 * In the third-person view it is re-mounted on the character's chest (see `mount`).
 */
export class LampLight {
  private readonly spot: SpotLight;
  private readonly fill: PointLight;
  private config: LampConfig;
  /** The fill is dimmer on the body: there it only rims the character for the camera. */
  private fillScale = 1;

  constructor(camera: PerspectiveCamera, config: LampConfig, quality: GraphicsQuality) {
    this.config = config;
    this.spot = new SpotLight(config.color, 0, config.range, config.angleDeg * DEG2RAD, config.penumbra, config.decay);
    this.spot.castShadow = quality.shadows;
    if (quality.shadows) {
      this.spot.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      this.spot.shadow.bias = -0.0006;
      this.spot.shadow.normalBias = 0.02;
      this.spot.shadow.camera.near = 0.2;
      this.spot.shadow.camera.far = config.range;
    }
    this.fill = new PointLight(config.color, 0, 4.5, 2);
    this.mount(camera, false);
  }

  /**
   * @param onBody false: at the eyes (first person). true: on the character's chest lamp
   *   (third person); the fill then sits behind the character so its back is lit for the camera.
   */
  mount(parent: Object3D, onBody: boolean): void {
    parent.add(this.spot, this.spot.target, this.fill);
    if (onBody) {
      this.spot.position.set(0, 0, -0.04);
      this.spot.target.position.set(0, -0.05, -5);
      this.fill.position.set(0, 0.8, 1.2);
      this.fillScale = 1.3;
    } else {
      this.spot.position.set(0.18, -0.22, 0.05);
      this.spot.target.position.set(0, -0.15, -5);
      this.fill.position.set(0, 0, 0.3);
      this.fillScale = 1;
    }
  }

  configure(config: LampConfig): void {
    this.config = config;
    this.spot.distance = config.range;
    this.spot.angle = config.angleDeg * DEG2RAD;
    this.spot.penumbra = config.penumbra;
    this.spot.decay = config.decay;
    this.spot.color.setHex(config.color);
    if (this.spot.castShadow) this.spot.shadow.camera.far = config.range;
  }

  /** @param output 0..1 from Lamp.output */
  update(output: number): void {
    this.spot.intensity = this.config.intensity * output;
    this.spot.distance = this.config.range * (0.55 + 0.45 * output);
    this.fill.intensity = 1.2 * output * this.fillScale;
  }
}
