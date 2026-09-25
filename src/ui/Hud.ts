import { Compass, createCompassModel, type CompassModel } from './Compass';

/** Plain data the game hands to the HUD each frame (the object is reused by the producer). */
export interface HudModel {
  levelLabel: string;
  elapsed: number;
  /** 0..1 */
  battery: number;
  lampOn: boolean;
  /** 0..1 */
  stamina: number;
  /** 0..1 highest robot suspicion */
  detection: number;
  chased: boolean;
  prompt: string | null;
  /** 0..1 danger intensity for the vignette */
  threat: number;
  grenades: number;
  hammerHits: number;
  nullifiers: number;
  /** Exit keycard: 'none' when this area has no locked exit. */
  keycard: 'none' | 'missing' | 'found';
  readonly compass: CompassModel;
  /** Touch: label of the context button in the middle of the screen, or null to hide it. */
  action: string | null;
  /** What the context button does. */
  actionMode: 'interact' | 'attack';
}

export function createHudModel(): HudModel {
  return {
    levelLabel: '',
    elapsed: 0,
    battery: 1,
    lampOn: false,
    stamina: 1,
    detection: 0,
    chased: false,
    prompt: null,
    threat: 0,
    grenades: 0,
    hammerHits: 0,
    nullifiers: 0,
    keycard: 'none',
    compass: createCompassModel(),
    action: null,
    actionMode: 'interact',
  };
}

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`[Hud] missing #${id}`);
  return e;
}

/**
 * Writes the HudModel to the DOM. Values are quantised and compared with the last written
 * value so the DOM is only touched when something visibly changes.
 */
export class Hud {
  private readonly root = el('hud');
  private readonly level = el('hud-level');
  private readonly time = el('hud-time');
  private readonly battery = el('hud-battery');
  private readonly lampLabel = el('hud-lamp-label');
  private readonly stamina = el('hud-stamina');
  private readonly detectFill = el('hud-detect-fill');
  private readonly detectLabel = el('hud-detect-label');
  private readonly detectBox = this.detectFill.closest('.hud-detect') as HTMLElement;
  private readonly prompt = el('hud-prompt');
  private readonly vignette = el('hud-vignette');
  private readonly toastEl = el('hud-toast');
  private readonly hammer = el('hud-hammer');
  private readonly grenades = el('hud-grenades');
  private readonly nullifiers = el('hud-nullifiers');
  private readonly keycard = el('hud-keycard');
  private readonly compass = new Compass(el('hud-compass'));
  // Touch-only controls (always in the DOM; CSS shows them only in the streamlined mobile layout).
  private readonly context = document.getElementById('touch-context');
  private readonly empCount = document.getElementById('touch-emp-count');
  private readonly empButton = this.empCount?.closest('button') ?? null;

  private last = {
    level: '',
    seconds: -1,
    battery: -1,
    lampOn: false,
    lowBattery: false,
    stamina: -1,
    detection: -1,
    chased: false,
    label: '',
    prompt: '' as string | null,
    threat: -1,
    grenades: -1,
    hammerHits: -1,
    nullifiers: -1,
    keycard: '',
    action: '' as string | null,
    actionMode: '',
  };
  private toastTimer = 0;

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  toast(message: string, seconds = 2.5): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), seconds * 1000);
  }

  update(m: Readonly<HudModel>): void {
    const l = this.last;

    if (m.levelLabel !== l.level) {
      l.level = m.levelLabel;
      this.level.textContent = m.levelLabel;
    }

    const seconds = Math.floor(m.elapsed);
    if (seconds !== l.seconds) {
      l.seconds = seconds;
      this.time.textContent = formatTime(seconds);
    }

    const battery = Math.round(m.battery * 100);
    if (battery !== l.battery) {
      l.battery = battery;
      this.battery.style.width = `${battery}%`;
    }
    const low = m.battery < 0.2;
    if (low !== l.lowBattery) {
      l.lowBattery = low;
      this.battery.classList.toggle('low', low);
    }
    if (m.lampOn !== l.lampOn) {
      l.lampOn = m.lampOn;
      this.lampLabel.classList.toggle('on', m.lampOn);
      this.lampLabel.textContent = m.lampOn ? 'LAMP ON' : 'LAMP';
    }

    const stamina = Math.round(m.stamina * 100);
    if (stamina !== l.stamina) {
      l.stamina = stamina;
      this.stamina.style.width = `${stamina}%`;
    }

    const detection = Math.round((m.chased ? 1 : m.detection) * 50);
    if (detection !== l.detection) {
      l.detection = detection;
      this.detectFill.style.width = `${detection * 2}%`;
    }
    if (m.chased !== l.chased) {
      l.chased = m.chased;
      this.detectBox.classList.toggle('chased', m.chased);
    }
    const label = m.chased
      ? 'DETECTED — RUN'
      : m.detection > 0.3
        ? 'SUSPICIOUS'
        : m.detection > 0.02
          ? 'NOTICED'
          : 'UNDETECTED';
    if (label !== l.label) {
      l.label = label;
      this.detectLabel.textContent = label;
    }

    if (m.prompt !== l.prompt) {
      l.prompt = m.prompt;
      this.prompt.classList.toggle('hidden', m.prompt === null);
      if (m.prompt) this.prompt.textContent = m.prompt;
    }

    if (m.hammerHits !== l.hammerHits) {
      l.hammerHits = m.hammerHits;
      this.hammer.textContent = m.hammerHits > 0 ? `HAMMER ${'▮'.repeat(m.hammerHits)}` : 'HAMMER —';
      this.hammer.classList.toggle('empty', m.hammerHits === 0);
    }
    if (m.grenades !== l.grenades) {
      l.grenades = m.grenades;
      this.grenades.textContent = `GRENADES ×${m.grenades}`;
      this.grenades.classList.toggle('empty', m.grenades === 0);
    }

    if (m.nullifiers !== l.nullifiers) {
      l.nullifiers = m.nullifiers;
      this.nullifiers.textContent = `NULLIFIER ×${m.nullifiers}`;
      this.nullifiers.classList.toggle('empty', m.nullifiers === 0);
      if (this.empCount) this.empCount.textContent = String(m.nullifiers);
      this.empButton?.classList.toggle('empty', m.nullifiers === 0);
    }
    if (this.context && (m.action !== l.action || m.actionMode !== l.actionMode)) {
      l.action = m.action;
      l.actionMode = m.actionMode;
      this.context.classList.toggle('hidden', m.action === null);
      if (m.action) this.context.textContent = m.action;
      this.context.dataset['mode'] = m.actionMode;
      this.context.classList.toggle('attack', m.actionMode === 'attack');
    }
    if (m.keycard !== l.keycard) {
      l.keycard = m.keycard;
      this.keycard.classList.toggle('hidden', m.keycard === 'none');
      this.keycard.classList.toggle('empty', m.keycard === 'missing');
      this.keycard.textContent = m.keycard === 'found' ? 'KEYCARD ✓' : 'KEYCARD —';
    }

    this.compass.update(m.compass);

    const threat = Math.round(m.threat * 20);
    if (threat !== l.threat) {
      l.threat = threat;
      this.vignette.style.opacity = String(threat / 20);
    }
  }
}

export function formatTime(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
