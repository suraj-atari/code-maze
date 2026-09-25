import type { RobotStateId } from './types';

export interface FootstepEvent {
  x: number;
  y: number;
  z: number;
  /** 0..1 */
  loudness: number;
}

export interface RobotStateEvent {
  robotId: number;
  from: RobotStateId | null;
  to: RobotStateId;
  x: number;
  y: number;
  z: number;
}

export interface PositionEvent {
  x: number;
  y: number;
  z: number;
}

export interface RobotDestroyedEvent extends PositionEvent {
  robotId: number;
  cause: 'hammer' | 'grenade';
}

export interface NullifierPulseEvent extends PositionEvent {
  /** Robots paralysed by this pulse. */
  stunned: number;
  seconds: number;
}

export interface LevelEvent {
  levelIndex: number;
  difficultyLabel: string;
  tutorial: boolean;
}

/** Every cross-module notification in the game. Payload objects may be reused by the emitter. */
export interface GameEvents {
  'lamp:toggled': { on: boolean };
  'lamp:denied': undefined;
  'lamp:empty': undefined;
  'lamp:flicker': undefined;
  'player:footstep': FootstepEvent;
  'player:caught': { robotId: number };
  'robot:stateChanged': RobotStateEvent;
  /** A robot that sees the player radioed the others (once per sighting streak). */
  'robots:alerted': { responders: number };
  'level:loaded': LevelEvent;
  'level:unloaded': undefined;
  'level:exitReached': undefined;
  'robot:destroyed': RobotDestroyedEvent;
  'armory:doorOpened': PositionEvent;
  'armory:looted': { grenades: number; hammerHits: number };
  'pickup:nullifier': { charges: number };
  'pickup:keycard': undefined;
  /** The player tried the exit without the keycard. */
  'level:exitLocked': undefined;
  'weapon:nullifierPulse': NullifierPulseEvent;
  'weapon:hammerSwing': undefined;
  'weapon:hammerHit': PositionEvent;
  'weapon:grenadeThrown': undefined;
  'weapon:grenadeBounce': PositionEvent;
  'weapon:explosion': PositionEvent;
  'weapon:empty': { weapon: 'hammer' | 'grenade' | 'nullifier' };
}
