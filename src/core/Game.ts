import { Vector3 } from 'three';
import { ROOM_LABELS } from '../armory/ArmoryAssets';
import { ArmoryManager } from '../armory/ArmoryManager';
import { AssetManager } from '../assets/AssetManager';
import { assetManifest } from '../assets/AssetManifest';
import { createProceduralTextures, TextureKeys } from '../assets/ProceduralTextures';
import { AudioManager } from '../audio/AudioManager';
import { GameAudio } from '../audio/GameAudio';
import { createSoundLibrary } from '../audio/SoundLibrary';
import { findDifficulty, resolveLevelConfig } from '../config/GameConfig';
import type { DifficultyConfig, GameConfig, GraphicsQuality } from '../config/types';
import type { DebugSystem } from '../debug/DebugSystem';
import { EffectsManager } from '../effects/EffectsManager';
import { ParticleSystem } from '../effects/ParticleSystem';
import { InputManager } from '../input/InputManager';
import { LevelManager } from '../level/LevelManager';
import { LampLight } from '../lighting/LampLight';
import { LightingSystem } from '../lighting/LightingSystem';
import { PhysicsSystem } from '../physics/PhysicsSystem';
import { FirstPersonCamera, type CameraRigInput } from '../player/FirstPersonCamera';
import { Lamp } from '../player/Lamp';
import { Player } from '../player/Player';
import { PlayerAvatar } from '../player/PlayerAvatar';
import { PlayerModelFactory } from '../player/PlayerModelFactory';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { ObjectPoolManager } from '../pooling/ObjectPoolManager';
import { SceneManager } from '../rendering/SceneManager';
import { RobotManager } from '../robots/RobotManager';
import { RobotModelFactory } from '../robots/RobotModelFactory';
import { createHudModel } from '../ui/Hud';
import { UIManager, type RunSummary, type UICommands } from '../ui/UIManager';
import { clamp } from '../utils/math';
import { detectDevice, enterImmersiveMode, type DeviceProfile } from '../utils/device';
import { TutorialDirector } from '../tutorial/TutorialDirector';
import { tutorialLevelConfig } from '../tutorial/TutorialLevel';
import { Random } from '../utils/Random';
import { WeaponModels } from '../weapons/WeaponModels';
import { Weapons } from '../weapons/Weapons';
import { EventBus } from './EventBus';
import type { GameEvents } from './GameEvents';
import { GameLoop } from './GameLoop';
import { GameState, GameStateManager } from './GameStateManager';

/** Systems that need async initialisation (WASM physics, assets, audio synthesis). */
interface GameWorld {
  readonly physics: PhysicsSystem;
  readonly pools: ObjectPoolManager;
  readonly audio: AudioManager;
  readonly gameAudio: GameAudio;
  readonly player: Player;
  readonly fpCamera: FirstPersonCamera;
  readonly tpCamera: ThirdPersonCamera;
  readonly avatar: PlayerAvatar;
  readonly lampLight: LampLight;
  readonly lighting: LightingSystem;
  readonly particles: ParticleSystem;
  readonly effects: EffectsManager;
  readonly robots: RobotManager;
  readonly armory: ArmoryManager;
  readonly weapons: Weapons;
  readonly levels: LevelManager;
  readonly tutorial: TutorialDirector;
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

type ViewMode = 'first' | 'third';
const VIEW_STORAGE_KEY = 'code-maze:view';

function loadViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'third' ? 'third' : 'first';
  } catch {
    return 'first';
  }
}

/**
 * Composition root and frame orchestrator. Builds every system, wires them together through
 * constructor injection and the EventBus, reacts to GameState changes and runs the loop.
 * Gameplay rules live in the systems themselves, not here.
 */
export class Game implements UICommands {
  private readonly events = new EventBus<GameEvents>();
  private readonly states = new GameStateManager();
  private readonly device: DeviceProfile;
  private readonly quality: GraphicsQuality;
  private readonly ui: UIManager;
  private readonly sceneManager: SceneManager;
  private readonly input: InputManager;
  private readonly loop: GameLoop;
  private readonly hud = createHudModel();
  private readonly rig: { -readonly [K in keyof CameraRigInput]: CameraRigInput[K] } = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    crouching: false,
    moveFactor: 0,
  };
  private readonly forward = new Vector3();
  private world: GameWorld | null = null;
  private debug: DebugSystem | null = null;
  private difficulty: DifficultyConfig;
  /** Wing of the facility the run is in (the game never shows it as a "level"). */
  private levelIndex = 0;
  private levelSeed = 0;
  /** Seed of the run's first wing: a retry starts the same run over. */
  private runSeed = 0;
  /** Time spent in wings already cleared this run. */
  private runTime = 0;
  /** Exit reached: the next wing loads at the start of the next frame. */
  private advancePending = false;
  /** Playing the guided training level instead of a normal run. */
  private tutorialMode = false;
  private viewMode: ViewMode = loadViewMode();
  private debugArmoryIndex = 0;
  private renderPending = false;

  constructor(
    private readonly config: GameConfig,
    container: HTMLElement,
    private readonly params: URLSearchParams,
  ) {
    this.device = detectDevice(params);
    this.quality = this.device.lowPower ? config.graphics.mobile : config.graphics.desktop;
    this.difficulty = findDifficulty(config, config.defaultDifficulty);

    this.ui = new UIManager(config.difficulties, config.defaultDifficulty, this, this.device.touch);
    this.ui.bindEvents(this.events);
    this.ui.showState(GameState.Loading);

    this.sceneManager = new SceneManager(container, this.quality, config.graphics.fovDeg);
    this.input = new InputManager(
      this.sceneManager.canvas,
      document.getElementById('touch-controls'),
      config.player,
      this.device,
    );
    this.input.onPointerLockChange = (locked) => {
      if (!locked && this.states.is(GameState.Playing)) this.pause();
    };
    this.sceneManager.canvas.addEventListener('click', () => {
      if (this.states.is(GameState.Playing)) this.input.requestPointerLock();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });

    this.loop = new GameLoop(this.frame);
    this.states.onChange(this.onStateChange);
    this.events.on('player:caught', this.onCaught);
    this.events.on('level:exitReached', this.onExitReached);
  }

  async init(): Promise<void> {
    const progress = (f: number, label: string) => this.ui.setLoading(f, label);
    const { scene, camera, renderer } = this.sceneManager;
    const cfg = this.config;

    progress(0.05, 'Booting physics core…');
    const physics = await PhysicsSystem.create();

    progress(0.3, 'Loading assets…');
    const assets = new AssetManager(renderer);
    await assets.loadManifest(assetManifest, (f) => progress(0.3 + f * 0.2, 'Loading assets…'));

    progress(0.5, 'Fabricating textures…');
    await nextFrame();
    const anisotropy = Math.min(this.quality.anisotropy, renderer.capabilities.getMaxAnisotropy());
    for (const [key, tex] of Object.entries(createProceduralTextures(anisotropy))) assets.registerTexture(key, tex);

    progress(0.65, 'Synthesising audio…');
    await nextFrame();
    const pools = new ObjectPoolManager();
    const audio = new AudioManager(cfg.audio, this.quality, createSoundLibrary(), pools);

    progress(0.85, 'Assembling sentinels…');
    await nextFrame();
    const rng = new Random((Math.random() * 0xffffffff) >>> 0);
    const lamp = new Lamp(cfg.lamp, rng, this.events);
    const player = new Player(physics, cfg.player, lamp, this.events);
    const lighting = new LightingSystem(scene, cfg.graphics, this.events, pools);
    const lampLight = new LampLight(camera, cfg.lamp, this.quality);
    const particles = new ParticleSystem(scene, this.quality.maxParticles, pools);
    const effects = new EffectsManager(particles, camera, rng, this.events);
    const robots = new RobotManager(
      scene,
      physics,
      this.events,
      new RobotModelFactory(assets),
      this.quality,
      cfg.robot,
      pools,
    );
    const weaponModels = new WeaponModels();
    const armory = new ArmoryManager(
      scene,
      physics,
      weaponModels,
      this.events,
      cfg.armory,
      cfg.maze,
      cfg.player.interactDistance,
    );
    const weapons = new Weapons({
      scene,
      camera,
      player,
      robots,
      models: weaponModels,
      obstacles: armory,
      events: this.events,
      config: cfg.weapons,
    });
    const levels = new LevelManager({
      scene,
      physics,
      textures: {
        wall: assets.requireTexture(TextureKeys.Wall),
        wallEmissive: assets.requireTexture(TextureKeys.WallEmissive),
        floor: assets.requireTexture(TextureKeys.Floor),
        ceiling: assets.requireTexture(TextureKeys.Ceiling),
        ceilingEmissive: assets.requireTexture(TextureKeys.CeilingEmissive),
      },
      shadows: this.quality.shadows,
      player,
      lampLight,
      robots,
      lighting,
      armory,
      weapons,
      events: this.events,
    });

    const tutorial = new TutorialDirector({
      scene,
      player,
      weapons,
      armory,
      robots,
      levels,
      events: this.events,
      view: this.ui.tutorialView,
      touch: this.device.touch,
    });
    this.ui.tutorialPanel.onContinue = () => {
      // Clicking the card is a user gesture: also (re)capture the mouse on desktop.
      this.input.requestPointerLock();
      tutorial.continue();
    };

    this.world = {
      physics,
      pools,
      audio,
      gameAudio: new GameAudio(audio, rng, this.events),
      player,
      fpCamera: new FirstPersonCamera(camera, cfg.player),
      tpCamera: new ThirdPersonCamera(camera, cfg.player),
      avatar: new PlayerAvatar(scene, new PlayerModelFactory(assets, weaponModels), this.events),
      lampLight,
      lighting,
      particles,
      effects,
      robots,
      armory,
      weapons,
      levels,
      tutorial,
    };

    this.applyViewMode(this.world);

    if (import.meta.env.DEV || this.params.has('debug')) await this.startDebug(this.world);

    progress(1, 'Ready');
    this.states.transition(GameState.MainMenu);
    this.loop.start();
  }

  showFatal(message: string): void {
    this.ui.showFatal(message);
  }

  // ---------------------------------------------------------------- UICommands

  start(difficultyId: string): void {
    this.world?.audio.unlock();
    this.tutorialMode = false;
    this.difficulty = findDifficulty(this.config, difficultyId);
    this.levelIndex = 0;
    this.levelSeed = this.runSeed = this.newSeed();
    this.runTime = 0;
    this.loadLevelAndPlay();
  }

  startTutorial(): void {
    this.world?.audio.unlock();
    this.tutorialMode = true;
    this.levelIndex = 0;
    this.loadLevelAndPlay();
  }

  resume(): void {
    if (this.states.is(GameState.Paused)) this.enterPlaying();
  }

  restart(): void {
    // The run starts over from its first wing, with the same seed: the player keeps the
    // layout they have started to learn.
    if (!this.tutorialMode) {
      this.levelIndex = 0;
      this.levelSeed = this.runSeed;
      this.runTime = 0;
    }
    this.loadLevelAndPlay();
  }

  nextLevel(): void {
    this.levelIndex++;
    this.levelSeed = this.newSeed();
    this.loadLevelAndPlay();
  }

  quitToMenu(): void {
    const w = this.world;
    if (!w) return;
    w.tutorial.stop();
    w.levels.unload();
    w.gameAudio.stopLevel();
    w.effects.clear();
    this.input.releasePointerLock();
    this.states.transition(GameState.MainMenu);
  }

  // ---------------------------------------------------------------- flow

  private pause(): void {
    if (this.states.is(GameState.Playing)) this.states.transition(GameState.Paused);
  }

  private loadLevelAndPlay(): void {
    const w = this.world;
    if (!w) return;
    w.audio.unlock();
    w.tutorial.stop();
    this.advancePending = false;
    this.loadWing(w, false);
    this.enterPlaying();
    if (this.tutorialMode) w.tutorial.start();
  }

  /** Builds the current wing (or the training course). */
  private loadWing(w: GameWorld, carryOver: boolean): void {
    w.effects.clear();
    const levelConfig = this.tutorialMode
      ? tutorialLevelConfig(this.config)
      : resolveLevelConfig(this.config, this.difficulty, this.levelIndex, this.levelSeed);
    const level = w.levels.load(levelConfig, carryOver);
    w.fpCamera.reset();
    w.tpCamera.reset();
    w.effects.setExit(level.exit.position.x, level.exit.position.z);
    w.gameAudio.startLevel(level.exit.position);
    this.hud.levelLabel = this.tutorialMode
      ? 'GAME PLAY TUTORIAL'
      : `RESEARCH FACILITY · ${this.difficulty.label.toUpperCase()}`;
    this.input.flush();
  }

  /**
   * Walks straight through the exit into the next wing: bigger, with more sentinels. No
   * "level complete" screen; supplies carry over.
   */
  private advanceWing(w: GameWorld): void {
    this.advancePending = false;
    this.runTime += w.levels.current?.elapsed ?? 0;
    this.levelIndex++;
    this.levelSeed = this.newSeed();
    this.loadWing(w, true);
  }

  /** Must run inside a user gesture (button click) for pointer lock / fullscreen. */
  private enterPlaying(): void {
    if (this.device.touch) enterImmersiveMode();
    else this.input.requestPointerLock();
    this.input.flush();
    this.states.transition(GameState.Playing);
  }

  private toggleView(w: GameWorld): void {
    this.viewMode = this.viewMode === 'first' ? 'third' : 'first';
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, this.viewMode);
    } catch {
      /* storage unavailable — the choice just isn't remembered */
    }
    this.applyViewMode(w);
    this.ui.toast(this.viewMode === 'third' ? 'THIRD-PERSON VIEW' : 'FIRST-PERSON VIEW');
  }

  /** Moves the lamp to the eyes or the character's chest and swaps hammer view model / body. */
  private applyViewMode(w: GameWorld): void {
    const third = this.viewMode === 'third';
    w.lampLight.mount(third ? w.avatar.lampAnchor : this.sceneManager.camera, third);
    w.weapons.firstPerson = !third;
    w.avatar.setVisible(third);
  }

  private newSeed(): number {
    return (Math.random() * 0xffffffff) >>> 0;
  }

  private summary(): RunSummary {
    return {
      levelIndex: this.levelIndex,
      difficultyLabel: this.tutorialMode ? 'Training' : this.difficulty.label,
      time: (this.tutorialMode ? 0 : this.runTime) + (this.world?.levels.current?.elapsed ?? 0),
    };
  }

  private readonly onStateChange = (next: GameState): void => {
    this.ui.showState(next);
    this.input.setTouchControlsVisible(next === GameState.Playing);
    const w = this.world;
    if (next === GameState.Playing) {
      w?.audio.resume();
    } else {
      this.input.releasePointerLock();
      if (next === GameState.Paused) w?.audio.suspend();
      if (next === GameState.GameOver || next === GameState.LevelComplete) w?.gameAudio.stopLevel();
    }
    this.renderPending = true;
  };

  private readonly onCaught = ({ robotId }: { robotId: number }): void => {
    const w = this.world;
    if (!w || !this.states.is(GameState.Playing)) return;
    if (w.tutorial.active) {
      // Training: no game over, the director restarts the lesson from its checkpoint.
      w.tutorial.onCaught();
      return;
    }
    // Snap the view to the robot that got us for the final frame.
    const robot = w.robots.robots.find((r) => r.id === robotId);
    if (robot) {
      const p = w.player.position;
      w.player.yaw = Math.atan2(-(robot.position.x - p.x), -(robot.position.z - p.z));
      w.player.pitch = -0.12;
      this.syncCamera(w, 1);
    }
    this.ui.showGameOver(this.summary());
    this.states.transition(GameState.GameOver);
  };

  private readonly onExitReached = (): void => {
    if (!this.states.is(GameState.Playing)) return;
    if (this.tutorialMode) {
      this.world?.tutorial.stop();
      this.ui.showTutorialComplete(this.summary());
      this.states.transition(GameState.LevelComplete);
      return;
    }
    this.advancePending = true;
  };

  // ---------------------------------------------------------------- frame

  private readonly frame = (dt: number, time: number): void => {
    const w = this.world;
    if (!w) return;
    if (this.states.is(GameState.Playing)) {
      this.updatePlaying(w, dt, time);
    } else if (this.renderPending) {
      this.renderPending = false;
      this.sceneManager.render();
    }
    this.debug?.update(dt);
  };

  private updatePlaying(w: GameWorld, dt: number, time: number): void {
    if (this.advancePending) this.advanceWing(w);
    const input = this.input.poll();
    if (input.pausePressed) {
      this.pause();
      return;
    }
    if (input.viewTogglePressed) this.toggleView(w);

    if (w.tutorial.blocking) {
      // A coaching card is up: the world is frozen until the player continues.
      if (input.interactPressed || input.attackPressed) w.tutorial.continue();
      w.tutorial.updateFrozen(dt);
      this.syncCamera(w, dt);
      this.updateHud(w, 0);
      this.sceneManager.render();
      return;
    }

    w.player.update(dt, input);
    w.armory.update(dt, time, w.player, input.interactPressed, w.robots.robots);
    w.weapons.update(dt, input);
    w.levels.update(dt, time, input.interactPressed);
    if (!this.states.is(GameState.Playing) || this.advancePending) return;
    w.robots.update(dt, time);
    if (!this.states.is(GameState.Playing)) return;
    w.tutorial.update(dt, input);
    w.physics.step(dt);

    if (this.viewMode === 'third') w.avatar.update(dt, time, w.player, w.weapons.hammerHits > 0);
    this.syncCamera(w, dt);
    w.lampLight.update(w.player.lamp.output);
    w.lighting.update(dt);
    w.effects.update(dt, w.player.lamp.output);

    const threat = this.computeThreat(w);
    const cam = this.sceneManager.camera;
    cam.getWorldDirection(this.forward);
    w.audio.setListener(cam.position.x, cam.position.y, cam.position.z, this.forward.x, this.forward.y, this.forward.z);
    w.gameAudio.update(dt, w.robots.robots, threat);

    this.updateHud(w, threat);
    this.sceneManager.render();
  }

  private syncCamera(w: GameWorld, dt: number): void {
    const p = w.player;
    const r = this.rig;
    r.x = p.position.x;
    r.y = p.position.y;
    r.z = p.position.z;
    r.yaw = p.yaw;
    r.pitch = p.pitch;
    r.crouching = p.crouching;
    r.moveFactor = p.moveFactor;
    if (this.viewMode === 'third') {
      const maze = w.levels.current?.maze.data ?? null;
      const distance = w.tpCamera.update(r, maze, this.config.maze.wallHeight, dt);
      // Hide the body when a wall pushes the camera right up against the head.
      w.avatar.setVisible(distance > 0.7);
    } else {
      w.fpCamera.update(r, dt);
    }
    this.sceneManager.camera.updateMatrixWorld();
  }

  private computeThreat(w: GameWorld): number {
    const robots = w.robots;
    if (robots.chasingCount > 0) return clamp(1 - robots.nearestChaseDistance / 16, 0.35, 1);
    return robots.maxSuspicion * 0.5;
  }

  private updateHud(w: GameWorld, threat: number): void {
    const h = this.hud;
    const player = w.player;
    h.elapsed = (this.tutorialMode ? 0 : this.runTime) + (w.levels.current?.elapsed ?? 0);
    h.battery = player.lamp.batteryFraction;
    h.lampOn = player.lamp.isOn;
    h.stamina = player.staminaFraction;
    h.detection = w.robots.maxSuspicion;
    h.chased = w.robots.chasingCount > 0;
    h.threat = h.chased ? threat : 0;
    h.grenades = w.weapons.grenades;
    h.hammerHits = w.weapons.hammerHits;
    h.nullifiers = w.weapons.nullifiers;
    const level = w.levels.current;
    h.keycard = !level?.keycardRequired ? 'none' : level.hasKeycard ? 'found' : 'missing';
    const use = this.device.touch ? 'TAP USE' : 'PRESS E';
    h.prompt = w.armory.promptVisible
      ? `${use} TO OPEN ${ROOM_LABELS[w.armory.promptKind].text}`
      : w.levels.exitPromptVisible
        ? level?.exitLocked
          ? 'EXIT LOCKED — FIND THE KEYCARD IN THE SECURITY ROOM'
          : this.tutorialMode
            ? `${use} TO ESCAPE`
            : `${use} TO ENTER THE NEXT WING`
        : null;
    this.ui.updateHud(h);
  }

  private async startDebug(w: GameWorld): Promise<void> {
    const { DebugSystem } = await import('../debug/DebugSystem');
    const { renderer, scene } = this.sceneManager;
    this.debug = new DebugSystem({
      renderer,
      scene,
      physics: w.physics,
      pools: w.pools,
      robots: () => w.robots.robots,
      playerPosition: () => (w.levels.current ? w.player.position : null),
      particleCount: () => w.particles.liveCount,
      state: () => this.states.current,
      teleportToExit: () => {
        const exit = w.levels.current?.exit;
        if (exit) w.player.teleport(exit.position.x, exit.position.z);
      },
      teleportToRobot: () => {
        const level = w.levels.current;
        const robot = w.robots.active[0];
        if (!level || !robot) return;
        // Stand in the robot's view, as far as possible (5 m .. 2.5 m) with clear line of sight.
        const c = robot.controller;
        const maze = level.maze.data;
        for (let d = 5; d >= 2.5; d -= 0.5) {
          const x = c.position.x + Math.sin(c.heading) * d;
          const z = c.position.z + Math.cos(c.heading) * d;
          const cell = maze.cellAt(x, z);
          if (cell >= 0 && maze.isWalkable(cell) && maze.hasLineOfSight(c.position.x, c.position.z, x, z)) {
            w.player.teleport(x, z);
            w.player.yaw = Math.atan2(x - c.position.x, z - c.position.z);
            return;
          }
        }
        // Facing a wall: stand two cells away along the maze instead.
        const cell = level.maze.pathfinder.randomCellWithin(c.currentCell, 2, 2, level.rng);
        w.player.teleport(maze.centerX(cell), maze.centerZ(cell));
      },
      teleportToArmory: () => {
        const list = w.armory.armories;
        if (list.length === 0) return;
        // Cycles through the level's armories; stands in the corridor facing the door.
        const a = list[this.debugArmoryIndex++ % list.length]!;
        w.player.teleport(a.doorX + a.normalX * 1.6, a.doorZ + a.normalZ * 1.6);
        w.player.yaw = Math.atan2(a.normalX, a.normalZ);
        w.player.pitch = 0;
      },
      skipTutorialStep: () => w.tutorial.skipStep(),
    });
  }
}
