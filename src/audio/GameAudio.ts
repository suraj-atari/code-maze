import type { EventBus } from '../core/EventBus';
import type { FootstepEvent, GameEvents, RobotDestroyedEvent, RobotStateEvent } from '../core/GameEvents';
import type { RobotInfo, RobotStateId, Vec3Like } from '../core/types';
import { clamp, lerp } from '../utils/math';
import type { Random } from '../utils/Random';
import type { AudioManager, Voice } from './AudioManager';
import { SoundKeys } from './SoundLibrary';

const HUM_VOLUME: Readonly<Record<RobotStateId, number>> = {
  patrol: 0.5,
  investigate: 0.65,
  search: 0.7,
  chase: 1,
  return: 0.5,
};

const HUM_RATE: Readonly<Record<RobotStateId, number>> = {
  patrol: 1,
  investigate: 1.08,
  search: 1.12,
  chase: 1.35,
  return: 1,
};

/**
 * Bridges gameplay to sound: listens to game events for one-shots and drives the level's
 * loops (ambience, exit beacon, per-robot hums) and the proximity heartbeat.
 */
export class GameAudio {
  private ambient: Voice | null = null;
  private exitHum: Voice | null = null;
  /**
   * Per-robot hum loops keyed by robot id. Created lazily and dropped when a robot leaves the
   * active list, so robots can be destroyed or spawned mid-level (weapons, tutorial).
   */
  private readonly hums = new Map<number, { voice: Voice; frame: number }>();
  private humFrame = 0;
  private heartbeatTimer = 0;
  private flickerCooldown = 0;

  constructor(
    private readonly audio: AudioManager,
    private readonly rng: Random,
    events: EventBus<GameEvents>,
  ) {
    events.on('player:footstep', this.onFootstep);
    events.on('lamp:toggled', ({ on }) => this.audio.play(on ? SoundKeys.LampOn : SoundKeys.LampOff, { volume: 0.5 }));
    events.on('lamp:denied', () => this.audio.play(SoundKeys.LampDeny, { volume: 0.5 }));
    events.on('lamp:empty', () => this.audio.play(SoundKeys.LampOff, { volume: 0.6, rate: 0.55 }));
    events.on('lamp:flicker', this.onFlicker);
    events.on('robot:stateChanged', this.onRobotState);
    events.on('player:caught', () => this.audio.play(SoundKeys.Caught, { volume: 0.9 }));
    events.on('level:exitReached', () => this.audio.play(SoundKeys.Win, { volume: 0.8 }));
    events.on('robot:destroyed', this.onRobotDestroyed);
    events.on('armory:doorOpened', (e) => this.audio.play(SoundKeys.DoorSlide, { volume: 1, position: e }));
    events.on('armory:looted', () => this.audio.play(SoundKeys.Pickup, { volume: 0.7 }));
    events.on('pickup:nullifier', () => this.audio.play(SoundKeys.Pickup, { volume: 0.7, rate: 0.8 }));
    events.on('pickup:keycard', () => this.audio.play(SoundKeys.Pickup, { volume: 0.8, rate: 1.25 }));
    events.on('level:exitLocked', () => this.audio.play(SoundKeys.LampDeny, { volume: 0.6, rate: 0.8 }));
    events.on('weapon:nullifierPulse', (e) => this.audio.play(SoundKeys.Scan, { volume: 1, rate: 0.5, position: e }));
    events.on('weapon:hammerSwing', () =>
      this.audio.play(SoundKeys.Swing, { volume: 0.6, rate: 0.9 + this.rng.next() * 0.2 }),
    );
    events.on('weapon:hammerHit', (e) => this.audio.play(SoundKeys.Clang, { volume: 1, position: e }));
    events.on('weapon:grenadeThrown', () => this.audio.play(SoundKeys.Swing, { volume: 0.45, rate: 1.5 }));
    events.on('weapon:grenadeBounce', (e) => this.audio.play(SoundKeys.Clink, { volume: 0.6, position: e }));
    events.on('weapon:explosion', (e) => this.audio.play(SoundKeys.Explosion, { volume: 1, position: e }));
    events.on('weapon:empty', () => this.audio.play(SoundKeys.LampDeny, { volume: 0.4 }));
  }

  startLevel(exit: Readonly<Vec3Like>): void {
    this.stopLevel();
    this.ambient = this.audio.play(SoundKeys.Ambient, { loop: true, bus: 'ambient', volume: 1 });
    this.exitHum = this.audio.play(SoundKeys.ExitHum, { loop: true, volume: 0.7, position: exit });
  }

  stopLevel(): void {
    this.ambient?.stop();
    this.exitHum?.stop();
    for (const h of this.hums.values()) h.voice.stop();
    this.ambient = this.exitHum = null;
    this.hums.clear();
  }

  /**
   * @param threat 0..1 — how close danger is (drives heartbeat rate/volume)
   */
  update(dt: number, robots: readonly RobotInfo[], threat: number): void {
    this.flickerCooldown -= dt;
    const frame = ++this.humFrame;
    for (const r of robots) {
      let h = this.hums.get(r.id);
      if (!h) {
        const voice = this.audio.play(SoundKeys.RobotHum, { loop: true, volume: 0.5, position: r.position, rate: 1 });
        if (!voice) continue;
        h = { voice, frame };
        this.hums.set(r.id, h);
      }
      h.frame = frame;
      h.voice.setPosition(r.position.x, 1.4, r.position.z);
      h.voice.setVolume(HUM_VOLUME[r.stateId]);
      h.voice.setRate(HUM_RATE[r.stateId]);
    }
    for (const [id, h] of this.hums) {
      if (h.frame === frame) continue;
      h.voice.stop();
      this.hums.delete(id);
    }

    if (threat > 0.15) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this.heartbeatTimer = lerp(1.1, 0.36, clamp(threat, 0, 1));
        this.audio.play(SoundKeys.Heartbeat, { volume: 0.25 + 0.6 * threat });
      }
    } else {
      this.heartbeatTimer = 0;
    }
  }

  private readonly onFootstep = (e: FootstepEvent): void => {
    const keys = SoundKeys.Footsteps;
    this.audio.play(keys[this.rng.int(keys.length)]!, {
      volume: 0.15 + 0.5 * e.loudness,
      rate: 0.9 + this.rng.next() * 0.2,
    });
  };

  private readonly onRobotDestroyed = (e: RobotDestroyedEvent): void => {
    this.hums.get(e.robotId)?.voice.stop();
    this.hums.delete(e.robotId);
    this.audio.play(SoundKeys.RobotDown, { volume: 1, position: e });
  };

  private readonly onFlicker = (): void => {
    if (this.flickerCooldown > 0) return;
    this.flickerCooldown = 0.2;
    this.audio.play(SoundKeys.Flicker, { volume: 0.35 });
  };

  private readonly onRobotState = (e: RobotStateEvent): void => {
    if (e.to === 'chase') this.audio.play(SoundKeys.Alert, { volume: 1, position: e });
    else if (e.to === 'investigate' || e.to === 'search') this.audio.play(SoundKeys.Scan, { volume: 0.8, position: e });
  };
}
