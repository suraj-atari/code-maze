import type { AudioConfig, GraphicsQuality } from '../config/types';
import { ObjectPool } from '../pooling/ObjectPool';
import type { ObjectPoolManager } from '../pooling/ObjectPoolManager';

export interface PlayOptions {
  volume?: number;
  rate?: number;
  loop?: boolean;
  /** Omit for non-positional (2D) sounds. */
  position?: { readonly x: number; readonly y: number; readonly z: number };
  bus?: 'sfx' | 'ambient';
}

/**
 * A reusable output chain (gain → panner). AudioBufferSourceNodes are one-shot by design
 * in Web Audio, so only the cheap source node is created per play; the chain is pooled.
 */
export class Voice {
  source: AudioBufferSourceNode | null = null;
  readonly gain: GainNode;
  readonly panner: PannerNode;
  active = false;
  readonly onEnded: () => void;

  constructor(ctx: AudioContext, config: AudioConfig, hrtf: boolean, release: (v: Voice) => void) {
    this.gain = ctx.createGain();
    this.panner = ctx.createPanner();
    this.panner.panningModel = hrtf ? 'HRTF' : 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = config.refDistance;
    this.panner.maxDistance = config.maxDistance;
    this.panner.rolloffFactor = config.rolloffFactor;
    this.onEnded = () => release(this);
  }

  setPosition(x: number, y: number, z: number): void {
    const p = this.panner;
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else {
      p.setPosition(x, y, z);
    }
  }

  setVolume(v: number): void {
    this.gain.gain.value = v;
  }

  setRate(r: number): void {
    if (this.source) this.source.playbackRate.value = r;
  }

  /** Stops playback; the voice returns to the pool via `onended`. */
  stop(): void {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch {
      /* already stopped */
    }
  }
}

/**
 * Owns the AudioContext (created on the first user gesture), the mixing buses, the sound
 * buffers and a capped pool of voices. Positional sounds use PannerNodes; the listener follows
 * the camera.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private pool: ObjectPool<Voice> | null = null;

  constructor(
    private readonly config: AudioConfig,
    private readonly quality: GraphicsQuality,
    private readonly buffers: Map<string, AudioBuffer>,
    private readonly pools: ObjectPoolManager,
  ) {}

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture (click/tap) — browsers block autoplay otherwise. */
  unlock(): void {
    if (!this.ctx) this.createGraph();
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }

  play(key: string, opts: PlayOptions = {}): Voice | null {
    const ctx = this.ctx;
    const buffer = this.buffers.get(key);
    if (!ctx || !this.pool || !buffer) return null;
    const voice = this.pool.acquire();
    if (!voice) return null;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = opts.loop ?? false;
    source.playbackRate.value = opts.rate ?? 1;
    source.onended = voice.onEnded;

    const bus = opts.bus === 'ambient' ? this.ambientBus! : this.sfxBus!;
    voice.gain.disconnect();
    voice.panner.disconnect();
    source.connect(voice.gain);
    if (opts.position) {
      voice.setPosition(opts.position.x, opts.position.y, opts.position.z);
      voice.gain.connect(voice.panner);
      voice.panner.connect(bus);
    } else {
      voice.gain.connect(bus);
    }
    voice.setVolume(opts.volume ?? 1);
    voice.source = source;
    voice.active = true;
    source.start();
    return voice;
  }

  /** Updates the listener from the camera's world position and forward vector. */
  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  private createGraph(): void {
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx({ latencyHint: 'interactive' });
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 4;
    compressor.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.config.masterVolume;
    this.master.connect(compressor);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.config.sfxVolume;
    this.sfxBus.connect(this.master);

    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = this.config.ambientVolume;
    this.ambientBus.connect(this.master);

    const release = (v: Voice): void => {
      if (!v.active) return;
      v.active = false;
      if (v.source) {
        v.source.onended = null;
        v.source.disconnect();
        v.source = null;
      }
      this.pool?.release(v);
    };
    this.pool = this.pools.register(
      new ObjectPool<Voice>(
        'audio-voices',
        () => new Voice(ctx, this.config, this.quality.hrtfAudio, release),
        undefined,
        8,
        this.config.maxVoices,
      ),
    );
  }
}
