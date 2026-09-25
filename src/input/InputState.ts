/** Device-agnostic snapshot of player intent for one frame. */
export class InputState {
  /** -1 (left) .. 1 (right) */
  moveX = 0;
  /** -1 (back) .. 1 (forward) */
  moveY = 0;
  /** Yaw delta in radians this frame (positive = turn right). */
  lookX = 0;
  /** Pitch delta in radians this frame (positive = look down). */
  lookY = 0;
  sprint = false;
  crouch = false;
  /** One-shot presses (true for exactly one poll). */
  lampPressed = false;
  interactPressed = false;
  pausePressed = false;
  /** Hammer swing. */
  attackPressed = false;
  /** Grenade throw. */
  throwPressed = false;
  /** Robot nullifier pulse. */
  nullifyPressed = false;
  /** Switch first/third-person view. */
  viewTogglePressed = false;

  clear(): void {
    this.moveX = 0;
    this.moveY = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.sprint = false;
    this.crouch = false;
    this.lampPressed = false;
    this.interactPressed = false;
    this.pausePressed = false;
    this.attackPressed = false;
    this.throwPressed = false;
    this.nullifyPressed = false;
    this.viewTogglePressed = false;
  }
}

/** Anything that can contribute to the per-frame InputState. */
export interface InputSource {
  write(state: InputState): void;
  /** Drops any accumulated deltas / pending presses (e.g. when resuming). */
  flush(): void;
  dispose(): void;
}
