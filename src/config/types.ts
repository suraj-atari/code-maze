import type { RobotStateId } from '../core/types';

export interface StaminaConfig {
  readonly max: number;
  readonly drainPerSecond: number;
  readonly regenPerSecond: number;
  readonly regenDelay: number;
  /** Minimum stamina required to *start* sprinting. */
  readonly minToSprint: number;
}

export interface MovementNoiseConfig {
  readonly walk: number;
  readonly sprint: number;
  readonly crouch: number;
}

export interface PlayerConfig {
  readonly radius: number;
  /** Half height of the cylindrical part of the capsule. */
  readonly halfHeight: number;
  readonly eyeHeight: number;
  readonly crouchEyeHeight: number;
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  readonly crouchSpeed: number;
  /** How fast velocity approaches the target velocity (1/s). */
  readonly acceleration: number;
  readonly gravity: number;
  /** Radians per pixel. */
  readonly mouseSensitivity: number;
  /** Radians per pixel of touch drag. */
  readonly touchSensitivity: number;
  readonly maxPitch: number;
  readonly stamina: StaminaConfig;
  /** Radius (m) in which robots can hear the player, per movement mode. */
  readonly noiseRadius: MovementNoiseConfig;
  /** Distance (m) between footstep sounds, per movement mode. */
  readonly stepLength: MovementNoiseConfig;
  readonly headBob: { readonly amplitude: number; readonly frequency: number };
  readonly interactDistance: number;
  /** Over-the-shoulder camera (third-person view). */
  readonly thirdPerson: {
    /** Metres behind the head along the look direction. */
    readonly distance: number;
    /** Metres to the right (over the right shoulder). */
    readonly shoulder: number;
    /** Metres above eye height. */
    readonly height: number;
    /** Keeps the camera this far from walls. */
    readonly collisionRadius: number;
  };
}

export interface LampConfig {
  readonly batterySeconds: number;
  readonly drainPerSecond: number;
  readonly rechargePerSecond: number;
  /** Seconds after switching off before recharge starts. */
  readonly rechargeDelay: number;
  readonly intensity: number;
  readonly range: number;
  readonly angleDeg: number;
  readonly penumbra: number;
  readonly decay: number;
  readonly color: number;
  /** Battery fraction below which the lamp starts flickering. */
  readonly flickerBelow: number;
  /** Light output at (almost) empty battery, relative to full. */
  readonly minOutput: number;
  /** Battery fraction required to switch the lamp on. */
  readonly minBatteryToTurnOn: number;
}

export interface RobotConfig {
  readonly radius: number;
  readonly height: number;
  readonly patrolSpeed: number;
  readonly investigateSpeed: number;
  readonly searchSpeed: number;
  readonly chaseSpeed: number;
  readonly returnSpeed: number;
  /** Radians per second. */
  readonly turnSpeed: number;
  readonly catchRadius: number;
  readonly eyeLight: { readonly intensity: number; readonly range: number; readonly angleDeg: number };
  readonly stateColors: Readonly<Record<RobotStateId, number>>;
}

export interface AIConfig {
  /** Perception evaluations per second (staggered between robots). */
  readonly sensorHz: number;
  readonly visionRange: number;
  readonly visionFovDeg: number;
  /** Vision range multiplier while the player's lamp is off. */
  readonly darkVisionFactor: number;
  /** Vision range multiplier while the player is crouching. */
  readonly crouchVisionFactor: number;
  /** Robots always sense the player inside this radius, regardless of facing. */
  readonly proximityRadius: number;
  /** Multiplier applied to the player's noise radius. */
  readonly hearingMultiplier: number;
  /** Noise radius multiplier when there is no line of sight (walls). */
  readonly occludedHearingFactor: number;
  /** Suspicion gained per second while the player is visible (0..1 scale). */
  readonly suspicionGain: number;
  readonly suspicionDecay: number;
  readonly investigateThreshold: number;
  readonly loseSightSeconds: number;
  readonly searchSeconds: number;
  readonly searchRadiusCells: number;
  readonly lookAroundSeconds: number;
  readonly chaseRepathSeconds: number;
  readonly patrolWaypoints: number;
  readonly patrolRadiusCells: number;
  readonly minSpawnDistanceCells: number;
}

export interface MazeConfig {
  readonly cellSize: number;
  readonly wallHeight: number;
  /** Cells per side of a render chunk (spatial partition for frustum culling). */
  readonly chunkCells: number;
  /** Fraction of dead ends that get opened up to create loops (escape routes). */
  readonly braidFactor: number;
  readonly generator: string;
}

export interface DifficultyProgression {
  readonly mazeSizeStep: number;
  readonly maxMazeSize: number;
  readonly robotCountStep: number;
  readonly maxRobots: number;
  readonly robotSpeedStep: number;
  readonly maxRobotSpeed: number;
  readonly batteryStep: number;
  readonly minBattery: number;
  readonly darknessStep: number;
}

export interface DifficultyConfig {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Rooms per maze side (grid is 2n+1 cells). */
  readonly mazeSize: number;
  readonly robotCount: number;
  /** Robot speed multiplier. */
  readonly robotSpeed: number;
  readonly robotDetectionRange: number;
  readonly robotFovDeg: number;
  readonly robotHearing: number;
  readonly suspicionGain: number;
  readonly lampBattery: number;
  readonly lampRange: number;
  readonly lampRecharge: number;
  /** 0 = dim, 1 = pitch black. */
  readonly darknessLevel: number;
  readonly progression: DifficultyProgression;
}

export interface AudioConfig {
  readonly masterVolume: number;
  readonly sfxVolume: number;
  readonly ambientVolume: number;
  readonly maxVoices: number;
  readonly refDistance: number;
  readonly maxDistance: number;
  readonly rolloffFactor: number;
}

export interface GraphicsQuality {
  readonly id: string;
  readonly pixelRatioCap: number;
  readonly antialias: boolean;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly robotLights: boolean;
  readonly maxParticles: number;
  readonly anisotropy: number;
  readonly hrtfAudio: boolean;
}

export interface GraphicsConfig {
  readonly desktop: GraphicsQuality;
  readonly mobile: GraphicsQuality;
  readonly fovDeg: number;
  readonly fogColor: number;
  readonly ambientColor: number;
  /** [at darkness 0, at darkness 1] */
  readonly fogDensity: readonly [number, number];
  readonly ambientIntensity: readonly [number, number];
  /** Overhead fill (hemisphere light): pale from the ceiling, dark from the floor. */
  readonly hemiSkyColor: number;
  readonly hemiGroundColor: number;
  readonly hemiIntensity: readonly [number, number];
  readonly wallEmissive: readonly [number, number];
  readonly flashLights: number;
}

/** What a sealed room holds. */
export type LootKind = 'weapons' | 'nullifier' | 'keycard';

export interface ArmoryConfig {
  /** Minimum sealed rooms (dead ends behind a sliding door) per wing. */
  readonly perLevel: number;
  /** Fraction of eligible dead ends that become rooms (so every corridor branch has a few). */
  readonly roomsPerDeadEnd: number;
  readonly maxRooms: number;
  /** Fraction of the non-keycard rooms that hold a robot nullifier (at least one per wing). */
  readonly nullifierShare: number;
  /** Minimum path distance (cells) from the player start. */
  readonly minStartDistanceCells: number;
  /** Minimum Manhattan distance (cells) between two armories. */
  readonly spacingCells: number;
  readonly doorOpenSeconds: number;
  /** Robots within this distance of a closed door open it. */
  readonly robotOpenDistance: number;
  readonly pickupRadius: number;
  readonly loot: { readonly grenades: number; readonly hammerHits: number };
  /** Nullifier charges in a nullifier room. */
  readonly nullifierCharges: number;
}

export interface WeaponsConfig {
  readonly maxGrenades: number;
  readonly maxHammerHits: number;
  readonly hammer: {
    readonly reach: number;
    /** Full cone angle in front of the player that a swing can hit. */
    readonly coneDeg: number;
    readonly cooldown: number;
  };
  readonly grenade: {
    readonly throwSpeed: number;
    /** Extra upward velocity on throw (m/s). */
    readonly throwLift: number;
    readonly gravity: number;
    /** Velocity kept after hitting a wall/floor (0..1). */
    readonly bounce: number;
    readonly radius: number;
    /** Detonates after this long, or immediately on hitting a robot. */
    readonly fuseSeconds: number;
    readonly blastRadius: number;
    readonly cooldown: number;
  };
  /** EMP pulse that paralyses every robot in radius (no line of sight needed). */
  readonly nullifier: {
    readonly maxCharges: number;
    readonly radius: number;
    readonly stunSeconds: number;
    readonly cooldown: number;
  };
}

export interface GameConfig {
  readonly player: PlayerConfig;
  readonly lamp: LampConfig;
  readonly robot: RobotConfig;
  readonly ai: AIConfig;
  readonly maze: MazeConfig;
  readonly audio: AudioConfig;
  readonly graphics: GraphicsConfig;
  readonly armory: ArmoryConfig;
  readonly weapons: WeaponsConfig;
  readonly difficulties: readonly DifficultyConfig[];
  readonly defaultDifficulty: string;
}

/** Fully resolved parameters for one level (difficulty + progression applied). */
export interface LevelConfig {
  readonly levelIndex: number;
  readonly difficulty: DifficultyConfig;
  readonly seed: number;
  readonly mazeRooms: number;
  readonly robotCount: number;
  readonly darkness: number;
  readonly player: PlayerConfig;
  readonly lamp: LampConfig;
  readonly robot: RobotConfig;
  readonly ai: AIConfig;
  readonly maze: MazeConfig;
  /** Scripted training level (no game over, coached steps). */
  readonly tutorial?: boolean;
  /** Armory rooms at fixed cells instead of randomly chosen dead ends. */
  readonly fixedArmories?: readonly { readonly cell: number; readonly entrance: number; readonly loot?: LootKind }[];
}
