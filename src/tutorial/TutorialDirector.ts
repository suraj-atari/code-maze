import type { Scene } from 'three';
import type { ArmoryManager } from '../armory/ArmoryManager';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/GameEvents';
import type { InputState } from '../input/InputState';
import type { LevelManager } from '../level/LevelManager';
import type { Player } from '../player/Player';
import type { RobotManager } from '../robots/RobotManager';
import type { Weapons } from '../weapons/Weapons';
import { TutorialBeacon } from './TutorialBeacon';
import { cellOf, P, type PointName } from './TutorialMap';
import {
  caughtCard,
  ROBOTS,
  SPOTTED_CARD,
  STEPS,
  type CardLine,
  type RobotKey,
  type StepStats,
  type TutorialApi,
  type TutorialCard,
  type TutorialStep,
} from './TutorialSteps';

/** Ignore "continue" presses this soon after a card appears (avoids skipping by accident). */
const CARD_MIN_SECONDS = 0.4;

export interface TutorialCardView {
  readonly title: string;
  readonly lines: readonly CardLine[];
  readonly tone: 'info' | 'danger' | 'success';
  /** e.g. "STEP 3 / 15" */
  readonly progress: string;
}

/** The UI surface the director drives (implemented by the UIManager). */
export interface TutorialView {
  showCard(card: TutorialCardView): void;
  hideCard(): void;
  setObjective(text: string | null, progress: string): void;
  toast(message: string): void;
}

export interface TutorialDeps {
  readonly scene: Scene;
  readonly player: Player;
  readonly weapons: Weapons;
  readonly armory: ArmoryManager;
  readonly robots: RobotManager;
  readonly levels: LevelManager;
  readonly events: EventBus<GameEvents>;
  readonly view: TutorialView;
  readonly touch: boolean;
}

/**
 * Runs the guided training level: walks through STEPS, freezes the game to show coaching cards,
 * keeps the objective + guide beacon up to date, spawns the scripted sentinels, and turns
 * "caught" into a retry from the last checkpoint instead of a game over.
 */
export class TutorialDirector implements TutorialApi {
  active = false;
  readonly stats: StepStats = {
    look: 0,
    sprintTime: 0,
    crouchTime: 0,
    lampWentOff: false,
    swings: 0,
    doorOpened: false,
    looted: false,
  };

  private readonly beacon: TutorialBeacon;
  private stepIndex = -1;
  private readonly cards: TutorialCard[] = [];
  private cardAge = 0;
  private time = 0;
  private spottedShown = false;
  private pendingCaught = false;
  /** Scripted robot → live robot id (-1 when not spawned or destroyed). */
  private readonly robotIds = new Map<RobotKey, number>();
  private readonly checkpoint = { x: 0, z: 0, yaw: 0 };

  constructor(private readonly deps: TutorialDeps) {
    this.beacon = new TutorialBeacon(deps.scene);
    const e = deps.events;
    e.on('lamp:toggled', ({ on }) => {
      if (!on) this.stats.lampWentOff = true;
    });
    e.on('weapon:hammerSwing', () => this.stats.swings++);
    e.on('armory:doorOpened', () => (this.stats.doorOpened = true));
    e.on('armory:looted', () => (this.stats.looted = true));
    e.on('robot:destroyed', ({ robotId }) => {
      for (const [key, id] of this.robotIds) if (id === robotId) this.robotIds.set(key, -1);
    });
    e.on('robot:stateChanged', ({ to }) => {
      if (!this.active || to !== 'chase' || this.spottedShown || !this.step?.stealth) return;
      this.spottedShown = true;
      this.queue(SPOTTED_CARD);
    });
  }

  /** True while a coaching card is up: the game world is frozen. */
  get blocking(): boolean {
    return this.active && this.cards.length > 0;
  }

  private get step(): TutorialStep | undefined {
    return STEPS[this.stepIndex];
  }

  /** Begins the script. Call right after the tutorial level has loaded. */
  start(): void {
    this.active = true;
    this.stepIndex = -1;
    this.cards.length = 0;
    this.spottedShown = false;
    this.pendingCaught = false;
    this.robotIds.clear();
    this.advance();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.cards.length = 0;
    this.beacon.hide();
    this.deps.view.hideCard();
    this.deps.view.setObjective(null, '');
  }

  /** The player acknowledged the current card. */
  continue(): void {
    if (!this.blocking || this.cardAge < CARD_MIN_SECONDS) return;
    this.cards.shift();
    this.showNextCard();
  }

  /** Debug: jump to the next step (closes any open cards). */
  skipStep(): void {
    if (!this.active) return;
    this.cards.length = 0;
    this.advance();
  }

  /** Robots reported a catch; handled on the next update (not mid robot-update). */
  onCaught(): void {
    this.pendingCaught = true;
  }

  /** While frozen: only card timing and the beacon animation run. */
  updateFrozen(dt: number): void {
    this.cardAge += dt;
    this.time += dt;
    this.beacon.update(this.time);
  }

  update(dt: number, input: Readonly<InputState>): void {
    if (!this.active) return;
    this.time += dt;
    this.beacon.update(this.time);

    if (this.pendingCaught) {
      this.pendingCaught = false;
      this.retryFromCheckpoint();
      return;
    }

    const s = this.stats;
    const p = this.deps.player;
    s.look += Math.abs(input.lookX) + Math.abs(input.lookY);
    if (p.sprinting && p.moveFactor > 0.3) s.sprintTime += dt;
    if (p.crouching && p.moveFactor > 0.05) s.crouchTime += dt;

    const step = this.step;
    if (!step) return;
    step.onUpdate?.(this);
    if (step.done(this)) this.advance();
  }

  // ------------------------------------------------------------------ TutorialApi

  get lampOn(): boolean {
    return this.deps.player.lamp.isOn;
  }

  near(point: PointName, radius: number): boolean {
    const [x, z] = this.pointWorld(point);
    const p = this.deps.player.position;
    return Math.hypot(p.x - x, p.z - z) <= radius;
  }

  robotInView(key: RobotKey, range: number): boolean {
    const robot = this.robot(key);
    const maze = this.deps.levels.current?.maze.data;
    if (!robot || !maze) return false;
    const p = this.deps.player.position;
    const r = robot.position;
    return Math.hypot(p.x - r.x, p.z - r.z) <= range && maze.hasLineOfSight(p.x, p.z, r.x, r.z);
  }

  robotAlive(key: RobotKey): boolean {
    return this.robot(key) !== undefined;
  }

  spawnRobot(key: RobotKey): void {
    const def = ROBOTS[key];
    const id = this.deps.robots.spawnScripted(cellOf(def.spawn), def.heading, def.route.map(cellOf));
    this.robotIds.set(key, id);
  }

  ensureWeapons(grenades: number, hammerHits: number): void {
    const w = this.deps.weapons;
    const addGrenades = w.grenadesInFlight === 0 ? Math.max(0, grenades - w.grenades) : 0;
    const addHits = Math.max(0, hammerHits - w.hammerHits);
    if (addGrenades === 0 && addHits === 0) return;
    w.grant(addGrenades, addHits);
    const parts = [addHits > 0 ? `HAMMER +${addHits}` : '', addGrenades > 0 ? `GRENADES +${addGrenades}` : ''];
    this.deps.view.toast(`TRAINING SUPPLY: ${parts.filter(Boolean).join(' · ')}`);
  }

  // ------------------------------------------------------------------ internals

  private robot(key: RobotKey): { readonly position: { x: number; z: number } } | undefined {
    const id = this.robotIds.get(key);
    if (id === undefined || id < 0) return undefined;
    return this.deps.robots.robots.find((r) => r.id === id);
  }

  private pointWorld(point: PointName): [number, number] {
    const maze = this.deps.levels.current?.maze.data;
    const s = maze?.cellSize ?? 1;
    const [x, y] = P[point];
    return [(x + 0.5) * s, (y + 0.5) * s];
  }

  private advance(): void {
    this.stepIndex++;
    const step = this.step;
    if (!step) {
      this.stop();
      return;
    }
    const s = this.stats;
    s.look = s.sprintTime = s.crouchTime = s.swings = 0;
    s.lampWentOff = !this.deps.player.lamp.isOn;
    s.doorOpened = this.deps.armory.armories.some((a) => !a.closed);
    s.looted = this.deps.armory.armories.some((a) => a.looted);

    const p = this.deps.player;
    this.checkpoint.x = p.position.x;
    this.checkpoint.z = p.position.z;
    this.checkpoint.yaw = p.yaw;

    step.onStart?.(this);
    for (const card of step.cards ?? []) this.cards.push(card);
    this.showNextCard();
    this.updateBeacon(step);
    const objective = this.deps.touch ? (step.touchObjective ?? step.objective) : step.objective;
    this.deps.view.setObjective(objective, this.progress());
  }

  private updateBeacon(step: TutorialStep): void {
    const b = step.beacon;
    const armory = this.deps.armory.armories[0];
    if (!b) this.beacon.hide();
    else if (b === 'door') armory ? this.beacon.show(armory.doorX, armory.doorZ) : this.beacon.hide();
    else if (b === 'cache') armory ? this.beacon.show(armory.cacheX, armory.cacheZ) : this.beacon.hide();
    else this.beacon.show(...this.pointWorld(b));
  }

  private queue(card: TutorialCard): void {
    this.cards.push(card);
    if (this.cards.length === 1) this.showNextCard();
  }

  private showNextCard(): void {
    const card = this.cards[0];
    if (!card) {
      this.deps.view.hideCard();
      return;
    }
    this.cardAge = 0;
    this.deps.view.showCard({
      title: card.title,
      lines: this.deps.touch ? (card.touchBody ?? card.body) : card.body,
      tone: card.tone ?? 'info',
      progress: this.progress(),
    });
  }

  private progress(): string {
    return `STEP ${Math.min(this.stepIndex + 1, STEPS.length)} / ${STEPS.length}`;
  }

  /** Caught: back to the step's checkpoint, surviving scripted robots reset to their posts. */
  private retryFromCheckpoint(): void {
    const { player, robots } = this.deps;
    const c = this.checkpoint;
    player.teleport(c.x, c.z);
    player.yaw = c.yaw;
    player.pitch = 0;

    const alive = [...this.robotIds].filter(([, id]) => id >= 0).map(([key]) => key);
    robots.clear();
    this.robotIds.clear();
    for (const key of alive) this.spawnRobot(key);
    robots.resetCaught();

    this.cards.length = 0;
    this.queue(caughtCard(this.step?.combat === true));
  }

  dispose(): void {
    this.stop();
    this.beacon.dispose();
  }
}
