import type { InputSource, InputState } from './InputState';

const JOYSTICK_RADIUS = 60;
const DEAD_ZONE = 0.12;

/**
 * Mobile controls built on Pointer Events (multi-touch safe via pointerId):
 *  - floating virtual joystick on the left half (partial deflection = sneaking speed)
 *  - swipe-to-look on the right half
 *  - LAMP / USE / SMASH / THROW buttons (one-shot), RUN / SNEAK toggles, VIEW and pause buttons.
 * The DOM skeleton lives in index.html (#touch-controls); this class only wires it up.
 */
export class TouchInput implements InputSource {
  private readonly joyZone: HTMLElement;
  private readonly lookZone: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly buttons: HTMLElement[];

  private joyPointer = -1;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private moveX = 0;
  private moveY = 0;

  private lookPointer = -1;
  private lastLookX = 0;
  private lastLookY = 0;
  private lookX = 0;
  private lookY = 0;

  private sprintOn = false;
  private crouchOn = false;
  private lamp = false;
  private interact = false;
  private pause = false;
  private attack = false;
  private throwGrenade = false;
  private nullify = false;
  private view = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly sensitivity: number,
  ) {
    this.joyZone = this.q('.joystick-zone');
    this.lookZone = this.q('.look-zone');
    this.base = this.q('.joystick-base');
    this.knob = this.q('.joystick-knob');
    this.buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-action]'));

    this.joyZone.addEventListener('pointerdown', this.onJoyDown);
    this.joyZone.addEventListener('pointermove', this.onJoyMove);
    this.joyZone.addEventListener('pointerup', this.onJoyUp);
    this.joyZone.addEventListener('pointercancel', this.onJoyUp);
    this.lookZone.addEventListener('pointerdown', this.onLookDown);
    this.lookZone.addEventListener('pointermove', this.onLookMove);
    this.lookZone.addEventListener('pointerup', this.onLookUp);
    this.lookZone.addEventListener('pointercancel', this.onLookUp);
    for (const b of this.buttons) b.addEventListener('pointerdown', this.onButton);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('visible', visible);
    if (!visible) this.resetSticks();
  }

  write(state: InputState): void {
    state.moveX += this.moveX;
    state.moveY += this.moveY;
    state.lookX += this.lookX;
    state.lookY += this.lookY;
    state.sprint ||= this.sprintOn;
    state.crouch ||= this.crouchOn;
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

  private q(selector: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`[TouchInput] missing ${selector}`);
    return el;
  }

  private readonly onJoyDown = (e: PointerEvent): void => {
    if (this.joyPointer !== -1) return;
    e.preventDefault();
    this.joyPointer = e.pointerId;
    this.joyZone.setPointerCapture(e.pointerId);
    this.joyOriginX = e.clientX;
    this.joyOriginY = e.clientY;
    const rect = this.joyZone.getBoundingClientRect();
    this.base.style.left = `${e.clientX - rect.left}px`;
    this.base.style.top = `${e.clientY - rect.top}px`;
    this.base.classList.add('active');
    this.updateStick(e.clientX, e.clientY);
  };

  private readonly onJoyMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.joyPointer) return;
    this.updateStick(e.clientX, e.clientY);
  };

  private readonly onJoyUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.joyPointer) return;
    this.resetStick();
  };

  private updateStick(x: number, y: number): void {
    let dx = (x - this.joyOriginX) / JOYSTICK_RADIUS;
    let dy = (y - this.joyOriginY) / JOYSTICK_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.knob.style.transform = `translate(${dx * JOYSTICK_RADIUS}px, ${dy * JOYSTICK_RADIUS}px)`;
    const mag = Math.min(1, len);
    if (mag < DEAD_ZONE) {
      this.moveX = this.moveY = 0;
      return;
    }
    // Rescale so output starts from 0 at the dead-zone edge.
    const scale = (mag - DEAD_ZONE) / (1 - DEAD_ZONE) / (mag || 1);
    this.moveX = dx * scale;
    this.moveY = -dy * scale;
  }

  private resetStick(): void {
    this.joyPointer = -1;
    this.moveX = this.moveY = 0;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.base.classList.remove('active');
    // Sprint is a toggle that auto-cancels when the player lets go of the stick.
    this.setSprint(false);
  }

  private readonly onLookDown = (e: PointerEvent): void => {
    if (this.lookPointer !== -1) return;
    e.preventDefault();
    this.lookPointer = e.pointerId;
    this.lookZone.setPointerCapture(e.pointerId);
    this.lastLookX = e.clientX;
    this.lastLookY = e.clientY;
  };

  private readonly onLookMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.lookPointer) return;
    this.lookX += (e.clientX - this.lastLookX) * this.sensitivity;
    this.lookY += (e.clientY - this.lastLookY) * this.sensitivity;
    this.lastLookX = e.clientX;
    this.lastLookY = e.clientY;
  };

  private readonly onLookUp = (e: PointerEvent): void => {
    if (e.pointerId === this.lookPointer) this.lookPointer = -1;
  };

  private readonly onButton = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const action = (e.currentTarget as HTMLElement).dataset['action'];
    switch (action) {
      case 'lamp':
        this.lamp = true;
        break;
      case 'interact':
        this.interact = true;
        break;
      case 'pause':
        this.pause = true;
        break;
      case 'attack':
        this.attack = true;
        break;
      case 'throw':
        this.throwGrenade = true;
        break;
      case 'nullify':
        this.nullify = true;
        break;
      case 'view':
        this.view = true;
        break;
      case 'sprint':
        this.setSprint(!this.sprintOn);
        if (this.sprintOn) this.setCrouch(false);
        break;
      case 'crouch':
        this.setCrouch(!this.crouchOn);
        if (this.crouchOn) this.setSprint(false);
        break;
    }
  };

  private setSprint(on: boolean): void {
    this.sprintOn = on;
    this.toggleClass('sprint', on);
  }

  private setCrouch(on: boolean): void {
    this.crouchOn = on;
    this.toggleClass('crouch', on);
  }

  private toggleClass(action: string, on: boolean): void {
    for (const b of this.buttons) if (b.dataset['action'] === action) b.classList.toggle('on', on);
  }

  private resetSticks(): void {
    this.resetStick();
    this.lookPointer = -1;
    this.setCrouch(false);
    this.flush();
  }

  dispose(): void {
    this.joyZone.removeEventListener('pointerdown', this.onJoyDown);
    this.joyZone.removeEventListener('pointermove', this.onJoyMove);
    this.joyZone.removeEventListener('pointerup', this.onJoyUp);
    this.joyZone.removeEventListener('pointercancel', this.onJoyUp);
    this.lookZone.removeEventListener('pointerdown', this.onLookDown);
    this.lookZone.removeEventListener('pointermove', this.onLookMove);
    this.lookZone.removeEventListener('pointerup', this.onLookUp);
    this.lookZone.removeEventListener('pointercancel', this.onLookUp);
    for (const b of this.buttons) b.removeEventListener('pointerdown', this.onButton);
  }
}
