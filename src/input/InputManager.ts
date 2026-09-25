import type { PlayerConfig } from '../config/types';
import type { DeviceProfile } from '../utils/device';
import { InputState } from './InputState';
import { KeyboardMouseInput } from './KeyboardMouseInput';
import { TouchInput } from './TouchInput';

/** Merges all input sources into one InputState per frame. */
export class InputManager {
  private readonly state = new InputState();
  private readonly keyboardMouse: KeyboardMouseInput;
  private readonly touch: TouchInput | null;

  constructor(canvas: HTMLElement, touchRoot: HTMLElement | null, player: PlayerConfig, device: DeviceProfile) {
    this.keyboardMouse = new KeyboardMouseInput(canvas, player.mouseSensitivity);
    this.touch = device.touch && touchRoot ? new TouchInput(touchRoot, player.touchSensitivity) : null;
  }

  get usesTouch(): boolean {
    return this.touch !== null;
  }

  get pointerLocked(): boolean {
    return this.keyboardMouse.pointerLocked;
  }

  set onPointerLockChange(cb: ((locked: boolean) => void) | null) {
    this.keyboardMouse.onPointerLockChange = cb;
  }

  /** Must be called from a user gesture on desktop. No-op on touch devices. */
  requestPointerLock(): void {
    if (!this.touch) this.keyboardMouse.requestPointerLock();
  }

  releasePointerLock(): void {
    this.keyboardMouse.exitPointerLock();
  }

  setTouchControlsVisible(visible: boolean): void {
    this.touch?.setVisible(visible);
  }

  /** Builds this frame's input. The returned object is reused — do not keep references. */
  poll(): InputState {
    const s = this.state;
    s.clear();
    this.keyboardMouse.write(s);
    this.touch?.write(s);
    const len = Math.hypot(s.moveX, s.moveY);
    if (len > 1) {
      s.moveX /= len;
      s.moveY /= len;
    }
    return s;
  }

  flush(): void {
    this.keyboardMouse.flush();
    this.touch?.flush();
  }

  dispose(): void {
    this.keyboardMouse.dispose();
    this.touch?.dispose();
  }
}
