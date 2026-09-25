import type { InputSource, InputState } from './InputState';

const LAMP_KEYS = new Set(['KeyF', 'KeyL']);
const INTERACT_KEYS = new Set(['KeyE', 'Enter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const ATTACK_KEYS = new Set(['KeyQ']);
const THROW_KEYS = new Set(['KeyG']);
const NULLIFY_KEYS = new Set(['KeyR', 'KeyX']);
const VIEW_KEYS = new Set(['KeyV']);

/**
 * Desktop controls: WASD/arrows to move, mouse (pointer lock) to look, Shift sprint, C sneak,
 * F / right mouse button lamp, E interact, left mouse button / Q hammer, G grenade,
 * R / X robot nullifier, V view,
 * P / Esc pause.
 */
export class KeyboardMouseInput implements InputSource {
  private readonly keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private lamp = false;
  private interact = false;
  private pause = false;
  private attack = false;
  private throwGrenade = false;
  private nullify = false;
  private view = false;
  onPointerLockChange: ((locked: boolean) => void) | null = null;

  constructor(
    private readonly target: HTMLElement,
    private readonly sensitivity: number,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    target.addEventListener('mousedown', this.onMouseDown);
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.target;
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    try {
      // Modern browsers return a promise that rejects if called too soon after an exit.
      const result = this.target.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      /* ignored: the user can click the canvas to retry */
    }
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  write(state: InputState): void {
    const k = this.keys;
    state.moveX += (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    state.moveY += (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    state.sprint ||= k.has('ShiftLeft') || k.has('ShiftRight');
    state.crouch ||= k.has('KeyC');
    state.lookX += this.lookX;
    state.lookY += this.lookY;
    state.lampPressed ||= this.lamp;
    state.interactPressed ||= this.interact;
    state.pausePressed ||= this.pause;
    state.attackPressed ||= this.attack;
    state.throwPressed ||= this.throwGrenade;
    state.nullifyPressed ||= this.nullify;
    state.viewTogglePressed ||= this.view;
    this.lookX = this.lookY = 0;
    this.lamp = this.interact = this.pause = this.attack = this.throwGrenade = this.nullify = this.view = false;
  }

  flush(): void {
    this.lookX = this.lookY = 0;
    this.lamp = this.interact = this.pause = this.attack = this.throwGrenade = this.nullify = this.view = false;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.keys.add(e.code);
    if (LAMP_KEYS.has(e.code)) this.lamp = true;
    if (INTERACT_KEYS.has(e.code)) this.interact = true;
    if (PAUSE_KEYS.has(e.code)) this.pause = true;
    if (ATTACK_KEYS.has(e.code)) this.attack = true;
    if (THROW_KEYS.has(e.code)) this.throwGrenade = true;
    if (NULLIFY_KEYS.has(e.code)) this.nullify = true;
    if (VIEW_KEYS.has(e.code)) this.view = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.lookX += e.movementX * this.sensitivity;
    this.lookY += e.movementY * this.sensitivity;
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    if (e.button === 0) this.attack = true;
    if (e.button === 2) this.lamp = true;
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onLockChange = (): void => {
    this.onPointerLockChange?.(this.pointerLocked);
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.target.removeEventListener('mousedown', this.onMouseDown);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
  }
}
