import type { InputSource, InputState } from './InputState';

const JOYSTICK_RADIUS = 60;
const DEAD_ZONE = 0.12;
/** Pushing the stick past this deflection sprints (no separate RUN button needed). */
const SPRINT_DEFLECTION = 0.9;
/** Touches starting left of this fraction of the screen width drive the stick; the rest look. */
const STICK_SIDE = 0.45;
const NO_TOUCH = -1;

/**
 * Mobile controls:
 *  - floating virtual joystick on the left side (light push = quiet, push to the rim = sprint)
 *  - swipe-to-look on the right side
 *  - streamlined layout: EMP button + a context button (use a door / smash a robot) that the HUD
 *    shows only when it applies; the tutorial uses the full LAMP / USE / SMASH / THROW / RUN /
 *    SNEAK set, since it teaches each of them. VIEW and pause buttons in both.
 *
 * Stick and look use Touch Events on the whole control layer, tracked by touch identifier.
 * Every touch event re-checks the tracked touches against the fingers actually on the screen
 * (`TouchEvent.touches`), so a lost `touchend` (system gesture, notification, a UI change under
 * the finger) can never leave the stick "held" and ignoring new touches.
 * Buttons use Pointer Events and are skipped by the stick/look tracking.
 * The DOM skeleton lives in index.html (#touch-controls); this class only wires it up.
 */
export class TouchInput implements InputSource {
  private readonly joyZone: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly buttons: HTMLElement[];

  private joyId = NO_TOUCH;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private moveX = 0;
  private moveY = 0;

  private lookId = NO_TOUCH;
  private lastLookX = 0;
  private lastLookY = 0;
  private lookX = 0;
  private lookY = 0;

  private sprintOn = false;
  /** Sprinting because the stick is pushed to the rim. */
  private stickSprint = false;
  private crouchOn = false;
  private lamp = false;
  private interact = false;
  private pause = false;
  private attack = false;
  private throwGrenade = false;
  private nullify = false;
  private view = false;
  /** Called on the first touch of the stick or look area (e.g. to skip the intro). */
  onActivity: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly sensitivity: number,
  ) {
    this.joyZone = this.q('.joystick-zone');
    this.base = this.q('.joystick-base');
    this.knob = this.q('.joystick-knob');
    this.buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-action]'));

    // Non-passive so preventDefault() stops scrolling / zooming / the 300 ms click delay.
    const opts: AddEventListenerOptions = { passive: false };
    root.addEventListener('touchstart', this.onTouchStart, opts);
    root.addEventListener('touchmove', this.onTouchMove, opts);
    root.addEventListener('touchend', this.onTouchEnd, opts);
    root.addEventListener('touchcancel', this.onTouchEnd, opts);
    for (const b of this.buttons) b.addEventListener('pointerdown', this.onButton);
    window.addEventListener('blur', this.onBlur);
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
    state.sprint ||= this.sprintOn || this.stickSprint;
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

  // ---------------------------------------------------------------- stick + look (Touch Events)

  private readonly onTouchStart = (e: TouchEvent): void => {
    this.dropStaleTouches(e.touches);
    let used = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      // Buttons handle their own touches.
      if ((t.target as Element | null)?.closest?.('button')) continue;
      if (t.clientX < window.innerWidth * STICK_SIDE) {
        if (this.joyId !== NO_TOUCH) continue;
        this.joyId = t.identifier;
        this.joyOriginX = t.clientX;
        this.joyOriginY = t.clientY;
        const rect = this.joyZone.getBoundingClientRect();
        this.base.style.left = `${t.clientX - rect.left}px`;
        this.base.style.top = `${t.clientY - rect.top}px`;
        this.base.classList.add('active');
        this.updateStick(t.clientX, t.clientY);
      } else {
        if (this.lookId !== NO_TOUCH) continue;
        this.lookId = t.identifier;
        this.lastLookX = t.clientX;
        this.lastLookY = t.clientY;
      }
      used = true;
    }
    if (used) {
      e.preventDefault();
      this.onActivity?.();
    }
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      if (t.identifier === this.joyId) {
        this.updateStick(t.clientX, t.clientY);
      } else if (t.identifier === this.lookId) {
        this.lookX += (t.clientX - this.lastLookX) * this.sensitivity;
        this.lookY += (t.clientY - this.lastLookY) * this.sensitivity;
        this.lastLookX = t.clientX;
        this.lastLookY = t.clientY;
      }
    }
    if (this.joyId !== NO_TOUCH || this.lookId !== NO_TOUCH) e.preventDefault();
  };

  private readonly onTouchEnd = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const id = e.changedTouches[i]!.identifier;
      if (id === this.joyId) this.resetStick();
      else if (id === this.lookId) this.lookId = NO_TOUCH;
    }
    this.dropStaleTouches(e.touches);
  };

  /** Forgets tracked touches whose finger is no longer on the screen (a missed touchend). */
  private dropStaleTouches(active: TouchList): void {
    if (this.joyId !== NO_TOUCH && !hasTouch(active, this.joyId)) this.resetStick();
    if (this.lookId !== NO_TOUCH && !hasTouch(active, this.lookId)) this.lookId = NO_TOUCH;
  }

  private readonly onBlur = (): void => {
    this.resetStick();
    this.lookId = NO_TOUCH;
  };

  private updateStick(x: number, y: number): void {
    let dx = (x - this.joyOriginX) / JOYSTICK_RADIUS;
    let dy = (y - this.joyOriginY) / JOYSTICK_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    this.knob.style.transform = `translate(${(dx * JOYSTICK_RADIUS) | 0}px, ${(dy * JOYSTICK_RADIUS) | 0}px)`;
    const mag = Math.min(1, len);
    const sprint = mag >= SPRINT_DEFLECTION;
    if (sprint !== this.stickSprint) {
      this.stickSprint = sprint;
      this.base.classList.toggle('sprinting', sprint);
    }
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
    this.joyId = NO_TOUCH;
    this.moveX = this.moveY = 0;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.base.classList.remove('active', 'sprinting');
    this.stickSprint = false;
    // Sprint is a toggle that auto-cancels when the player lets go of the stick.
    this.setSprint(false);
  }

  // ---------------------------------------------------------------- buttons (Pointer Events)

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
      case 'context':
        // The HUD sets the mode to what the button currently offers.
        if ((e.currentTarget as HTMLElement).dataset['mode'] === 'attack') this.attack = true;
        else this.interact = true;
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
    this.lookId = NO_TOUCH;
    this.setCrouch(false);
    this.flush();
  }

  dispose(): void {
    this.root.removeEventListener('touchstart', this.onTouchStart);
    this.root.removeEventListener('touchmove', this.onTouchMove);
    this.root.removeEventListener('touchend', this.onTouchEnd);
    this.root.removeEventListener('touchcancel', this.onTouchEnd);
    for (const b of this.buttons) b.removeEventListener('pointerdown', this.onButton);
    window.removeEventListener('blur', this.onBlur);
  }
}

function hasTouch(list: TouchList, id: number): boolean {
  for (let i = 0; i < list.length; i++) if (list[i]!.identifier === id) return true;
  return false;
}
