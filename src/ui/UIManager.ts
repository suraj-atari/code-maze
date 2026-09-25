import type { DifficultyConfig } from '../config/types';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import { GameState } from '../core/GameStateManager';
import type { TutorialCardView, TutorialView } from '../tutorial/TutorialDirector';
import type { MazeData } from '../maze/MazeData';
import { drawMazeMap } from '../maze/MazeMapImage';
import { formatTime, Hud, type HudModel } from './Hud';
import { IntroOverlay } from './IntroOverlay';
import { TutorialPanel } from './TutorialPanel';

/** Actions the UI can request. Implemented by Game; the UI never reaches into game objects. */
export interface UICommands {
  start(difficultyId: string): void;
  startTutorial(): void;
  resume(): void;
  restart(): void;
  nextLevel(): void;
  quitToMenu(): void;
  skipIntro(): void;
}

export interface RunSummary {
  readonly levelIndex: number;
  readonly difficultyLabel: string;
  readonly time: number;
}

const DIFFICULTY_STORAGE_KEY = 'code-maze:difficulty';

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`[UI] missing #${id}`);
  return e as T;
}

/** All DOM-based UI: screens per GameState, HUD, loading bar and toasts. */
export class UIManager {
  private readonly hud = new Hud();
  private readonly screens: Partial<Record<GameState, HTMLElement>> = {
    loading: byId('screen-loading'),
    menu: byId('screen-menu'),
    paused: byId('screen-pause'),
    gameover: byId('screen-gameover'),
    complete: byId('screen-complete'),
  };
  private selectedDifficulty: string;
  /** The complete screen is showing the end of the tutorial ("play for real" instead of "next level"). */
  private tutorialDone = false;
  private readonly touch: boolean;
  readonly tutorialPanel: TutorialPanel;
  readonly intro: IntroOverlay;
  /** Called when the player picks another difficulty in the menu (the map preview changes). */
  onDifficultyChange: ((id: string) => void) | null = null;
  /** Surface the tutorial director draws on. */
  readonly tutorialView: TutorialView = {
    showCard: (c: TutorialCardView) => this.tutorialPanel.showCard(c),
    hideCard: () => this.tutorialPanel.hideCard(),
    setObjective: (text, progress) => this.tutorialPanel.setObjective(text, progress),
    toast: (message) => this.hud.toast(message, 2.5),
  };

  constructor(
    private readonly difficulties: readonly DifficultyConfig[],
    defaultDifficulty: string,
    private readonly commands: UICommands,
    touch: boolean,
  ) {
    this.touch = touch;
    document.body.classList.toggle('touch', touch);
    this.tutorialPanel = new TutorialPanel(touch);
    this.intro = new IntroOverlay(() => commands.skipIntro());
    this.selectedDifficulty = this.loadDifficulty(defaultDifficulty);
    this.buildDifficultyList();
    this.bindButtons();
  }

  /** Shows the screen belonging to a game state (or the HUD while playing). */
  showState(state: GameState): void {
    for (const [key, screen] of Object.entries(this.screens)) {
      screen?.classList.toggle('hidden', key !== state);
    }
    this.hud.setVisible(state === GameState.Playing || state === GameState.Paused);
    this.intro.setVisible(state === GameState.Intro);
  }

  /** Touch: the full button set (tutorial) or the streamlined one (normal runs). */
  setTouchLayout(classic: boolean): void {
    document.body.classList.toggle('touch-classic', classic);
  }

  get selectedDifficultyId(): string {
    return this.selectedDifficulty;
  }

  /** Draws the map of the next run in the main menu. */
  showMapPreview(maze: MazeData): void {
    drawMazeMap(byId<HTMLCanvasElement>('menu-map'), maze, { cellPx: 8 });
  }

  /**
   * Launch screen: loading is done. Shows the continue prompt and calls `onContinue` on the
   * first click, tap or key press (a user gesture: audio can start, phones can go fullscreen).
   */
  waitForContinue(onContinue: () => void): void {
    const screen = byId('screen-loading');
    byId('loading-label').classList.add('hidden');
    byId('loading-continue').classList.remove('hidden');
    screen.classList.add('ready');
    const go = (e: Event): void => {
      e.preventDefault();
      screen.removeEventListener('click', go);
      window.removeEventListener('keydown', go);
      screen.classList.remove('ready');
      onContinue();
    };
    // 'click' (not pointerdown): the menu appears after the tap ends, so the tap cannot land on a menu button.
    screen.addEventListener('click', go);
    window.addEventListener('keydown', go);
  }

  setLoading(fraction: number, label: string): void {
    byId('loading-bar').style.width = `${Math.round(fraction * 100)}%`;
    byId('loading-label').textContent = label;
  }

  toast(message: string, seconds = 1.8): void {
    this.hud.toast(message, seconds);
  }

  updateHud(model: Readonly<HudModel>): void {
    this.hud.update(model);
  }

  showGameOver(s: RunSummary): void {
    const wings = s.levelIndex === 1 ? '1 wing' : `${s.levelIndex} wings`;
    byId('gameover-stats').textContent =
      `A sentinel caught you after ${formatTime(s.time)} in the facility (${s.difficultyLabel}). You got through ${wings}.`;
  }

  showTutorialComplete(s: RunSummary): void {
    this.tutorialDone = true;
    byId('complete-title').textContent = 'TRAINING COMPLETE';
    byId('btn-next').textContent = 'PLAY FOR REAL';
    byId('complete-stats').textContent =
      `You finished the training in ${formatTime(s.time)}. You know every move now: stay dark, stay quiet, and find the exit.`;
  }

  showFatal(message: string): void {
    for (const screen of Object.values(this.screens)) screen?.classList.add('hidden');
    byId('fatal-message').textContent = message;
    byId('fatal-error').classList.remove('hidden');
  }

  bindEvents(events: EventBus<GameEvents>): void {
    events.on('lamp:empty', () => this.hud.toast('LAMP BATTERY DEPLETED'));
    events.on('lamp:denied', () => this.hud.toast('BATTERY TOO LOW — LET IT RECHARGE'));
    events.on('level:loaded', (e) => {
      if (e.tutorial) return;
      this.hud.toast(
        e.levelIndex === 0
          ? 'FIND THE KEYCARD IN THE SECURITY ROOM, THEN THE EXIT'
          : 'NEW WING — BIGGER, MORE AND FASTER SENTINELS. FIND THE KEYCARD',
        3.5,
      );
    });
    events.on('pickup:nullifier', () =>
      this.hud.toast(`ROBOT NULLIFIER ACQUIRED — ${this.touch ? 'TAP EMP' : 'PRESS R'} TO PARALYSE SENTINELS`, 3),
    );
    events.on('robots:alerted', (e) =>
      this.hud.toast(`SPOTTED — ${e.responders} MORE SENTINEL${e.responders > 1 ? 'S' : ''} CLOSING IN. RUN AND HIDE!`, 2.5),
    );
    events.on('pickup:keycard', () => this.hud.toast('KEYCARD ACQUIRED — THE EXIT IS UNLOCKED', 3));
    events.on('level:exitLocked', () => this.hud.toast('EXIT LOCKED — FIND THE KEYCARD IN THE SECURITY ROOM', 2.5));
    events.on('weapon:nullifierPulse', (e) =>
      this.hud.toast(
        e.stunned > 0
          ? `NULLIFIER PULSE — ${e.stunned} SENTINEL${e.stunned > 1 ? 'S' : ''} PARALYSED FOR ${e.seconds}s`
          : 'NULLIFIER PULSE — NO SENTINELS IN RANGE',
        2.2,
      ),
    );
    events.on('armory:looted', (e) =>
      this.hud.toast(`ARMORY LOOTED — HAMMER +${e.hammerHits} · GRENADES +${e.grenades}`, 3),
    );
    events.on('robot:destroyed', (e) =>
      this.hud.toast(e.cause === 'grenade' ? 'SENTINEL BLOWN UP' : 'SENTINEL SMASHED'),
    );
    events.on('weapon:empty', (e) =>
      this.hud.toast(
        e.weapon === 'hammer'
          ? 'NO HAMMER — FIND AN ARMORY'
          : e.weapon === 'grenade'
            ? 'NO GRENADES — FIND AN ARMORY'
            : 'NO NULLIFIER — SEARCH THE EMP LABS',
        1.8,
      ),
    );
  }

  private buildDifficultyList(): void {
    const list = byId('difficulty-list');
    list.replaceChildren();
    for (const d of this.difficulties) {
      const b = document.createElement('button');
      b.className = 'difficulty';
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset['id'] = d.id;
      const title = document.createElement('b');
      title.textContent = d.label.toUpperCase();
      const desc = document.createElement('small');
      desc.textContent = d.description;
      b.append(title, desc);
      b.addEventListener('click', () => this.selectDifficulty(d.id));
      list.append(b);
    }
    this.selectDifficulty(this.selectedDifficulty);
  }

  private selectDifficulty(id: string): void {
    const changed = id !== this.selectedDifficulty;
    this.selectedDifficulty = id;
    if (changed) this.onDifficultyChange?.(id);
    for (const b of byId('difficulty-list').querySelectorAll<HTMLElement>('.difficulty')) {
      b.setAttribute('aria-checked', String(b.dataset['id'] === id));
    }
    try {
      localStorage.setItem(DIFFICULTY_STORAGE_KEY, id);
    } catch {
      /* storage unavailable (private mode) — selection just isn't remembered */
    }
  }

  private loadDifficulty(fallback: string): string {
    try {
      const saved = localStorage.getItem(DIFFICULTY_STORAGE_KEY);
      if (saved && this.difficulties.some((d) => d.id === saved)) return saved;
    } catch {
      /* ignored */
    }
    return fallback;
  }

  private bindButtons(): void {
    const on = (id: string, fn: () => void) => byId(id).addEventListener('click', fn);
    on('btn-start', () => this.commands.start(this.selectedDifficulty));
    on('btn-tutorial', () => this.commands.startTutorial());
    on('btn-resume', () => this.commands.resume());
    on('btn-restart', () => this.commands.restart());
    on('btn-pause-menu', () => this.commands.quitToMenu());
    on('btn-retry', () => this.commands.restart());
    on('btn-gameover-menu', () => this.commands.quitToMenu());
    on('btn-next', () =>
      this.tutorialDone ? this.commands.start(this.selectedDifficulty) : this.commands.nextLevel(),
    );
    on('btn-complete-menu', () => this.commands.quitToMenu());
  }
}
