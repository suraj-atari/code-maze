import { Random } from '../utils/Random';

export const SoundKeys = {
  Footsteps: ['step0', 'step1', 'step2', 'step3'],
  LampOn: 'lampOn',
  LampOff: 'lampOff',
  LampDeny: 'lampDeny',
  Flicker: 'flicker',
  Alert: 'alert',
  Scan: 'scan',
  RobotHum: 'robotHum',
  Ambient: 'ambient',
  ExitHum: 'exitHum',
  Heartbeat: 'heartbeat',
  Caught: 'caught',
  Win: 'win',
  DoorSlide: 'doorSlide',
  Pickup: 'pickup',
  Swing: 'swing',
  Clang: 'clang',
  Clink: 'clink',
  Explosion: 'explosion',
  RobotDown: 'robotDown',
} as const;

const SR = 44100;
const TAU = Math.PI * 2;

type SampleFn = (t: number, i: number) => number;

function buffer(seconds: number, fn: SampleFn): AudioBuffer {
  const length = Math.max(1, Math.floor(seconds * SR));
  const buf = new AudioBuffer({ length, sampleRate: SR, numberOfChannels: 1 });
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = fn(i / SR, i);
  return buf;
}

/** One-pole low-pass filter state helper. */
function lowpass(cutoff: number): (x: number) => number {
  const a = 1 - Math.exp((-TAU * cutoff) / SR);
  let y = 0;
  return (x) => (y += a * (x - y));
}

/** Builds a seamless loop by crossfading an overshoot tail into the head. */
function seamlessLoop(seconds: number, fade: number, fn: SampleFn): AudioBuffer {
  const len = Math.floor(seconds * SR);
  const n = Math.floor(fade * SR);
  const raw = new Float32Array(len + n);
  for (let i = 0; i < raw.length; i++) raw[i] = fn(i / SR, i);
  const buf = new AudioBuffer({ length: len, sampleRate: SR, numberOfChannels: 1 });
  const out = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    if (i < n) {
      const a = i / n;
      out[i] = raw[i]! * a + raw[len + i]! * (1 - a);
    } else out[i] = raw[i]!;
  }
  return buf;
}

/**
 * Procedurally synthesised sound effects so the slice ships with zero audio files.
 * Generated once at load time. `AudioBuffer`s are context-independent, so this can run
 * before the AudioContext is unlocked by a user gesture.
 */
export function createSoundLibrary(): Map<string, AudioBuffer> {
  const rng = new Random(4242);
  const noise = () => rng.next() * 2 - 1;
  const lib = new Map<string, AudioBuffer>();

  SoundKeys.Footsteps.forEach((key, v) => {
    const lp = lowpass(900 + v * 250);
    lib.set(
      key,
      buffer(0.18, (t) => {
        const env = Math.min(1, t / 0.003) * Math.exp(-t * (32 + v * 4));
        return (lp(noise()) * 1.6 + Math.sin(TAU * (65 + v * 6) * t) * Math.exp(-t * 28) * 0.6) * env;
      }),
    );
  });

  lib.set(SoundKeys.LampOn, buffer(0.06, (t) => (Math.sin(TAU * 1500 * t) * 0.5 + noise() * 0.4) * Math.exp(-t * 90)));
  lib.set(SoundKeys.LampOff, buffer(0.06, (t) => (Math.sin(TAU * 900 * t) * 0.5 + noise() * 0.35) * Math.exp(-t * 100)));
  lib.set(
    SoundKeys.LampDeny,
    buffer(0.22, (t) => {
      const click = (t0: number) => (t >= t0 ? Math.sin(TAU * 320 * (t - t0)) * Math.exp(-(t - t0) * 70) : 0);
      return (click(0) + click(0.1)) * 0.7;
    }),
  );
  {
    const lp = lowpass(3000);
    lib.set(
      SoundKeys.Flicker,
      buffer(0.16, (t) => {
        const buzz = Math.sign(Math.sin(TAU * 100 * t)) * 0.25;
        return (buzz + lp(noise()) * 0.6) * (rng.next() < 0.7 ? 1 : 0.2) * Math.exp(-t * 12);
      }),
    );
  }

  lib.set(
    SoundKeys.Alert,
    buffer(0.95, (t) => {
      const f = Math.floor(t / 0.14) % 2 === 0 ? 880 : 620;
      const tone = Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2 * t) + 0.2 * Math.sin(TAU * f * 3 * t);
      return tone * 0.45 * Math.min(1, t / 0.01) * Math.min(1, (0.95 - t) / 0.1);
    }),
  );

  lib.set(
    SoundKeys.Scan,
    buffer(0.55, (t) => {
      const f = 400 + 1600 * t;
      return Math.sin(TAU * f * t) * 0.3 * Math.sin((Math.PI * t) / 0.55);
    }),
  );

  lib.set(
    SoundKeys.RobotHum,
    seamlessLoop(2, 0.05, (t) => {
      const am = 0.8 + 0.2 * Math.sin(TAU * 4 * t);
      const base = Math.sin(TAU * 55 * t) * 0.5 + Math.sin(TAU * 110 * t) * 0.25 + Math.sin(TAU * 165 * t) * 0.12;
      const whine = Math.sin(TAU * 880 * t) * 0.04 * (0.5 + 0.5 * Math.sin(TAU * 0.5 * t));
      return (base * am + whine) * 0.6;
    }),
  );

  {
    const lp = lowpass(180);
    const lp2 = lowpass(1200);
    lib.set(
      SoundKeys.Ambient,
      seamlessLoop(8, 1, (t) => {
        const drone =
          Math.sin(TAU * 40 * t) * 0.3 +
          Math.sin(TAU * 40.125 * t) * 0.3 +
          Math.sin(TAU * 60.25 * t) * 0.12 +
          Math.sin(TAU * 80 * t) * 0.06 * (0.5 + 0.5 * Math.sin(TAU * 0.125 * t));
        const rumble = lp(noise()) * 1.4;
        // A distant metallic groan around 3.2s.
        const ct = t - 3.2;
        const creak = ct > 0 && ct < 1.2 ? Math.sin(TAU * (310 - 60 * ct) * ct) * Math.sin(TAU * 437 * ct) * 0.12 * Math.exp(-ct * 3) : 0;
        const hiss = lp2(noise()) * 0.03;
        return (drone + rumble + creak + hiss) * 0.5;
      }),
    );
  }

  lib.set(
    SoundKeys.ExitHum,
    seamlessLoop(2, 0.05, (t) => {
      const am = 0.7 + 0.3 * Math.sin(TAU * 2 * t);
      return (Math.sin(TAU * 220 * t) * 0.3 + Math.sin(TAU * 330 * t) * 0.2 + Math.sin(TAU * 440 * t) * 0.1) * am * 0.5;
    }),
  );

  lib.set(
    SoundKeys.Heartbeat,
    buffer(0.6, (t) => {
      const thump = (t0: number, amp: number) => {
        const dt = t - t0;
        if (dt < 0) return 0;
        const f = 48 + 40 * Math.exp(-dt * 30);
        return Math.sin(TAU * f * dt) * Math.exp(-dt * 16) * amp;
      };
      return thump(0, 1) + thump(0.22, 0.7);
    }),
  );

  {
    const lp = lowpass(2500);
    lib.set(
      SoundKeys.Caught,
      buffer(1.6, (t) => {
        const f = 400 * Math.exp(-t * 1.6) + 50;
        const saw = ((f * t) % 1) * 2 - 1;
        const burst = lp(noise()) * Math.exp(-t * 3);
        const s = (saw * 0.6 + burst) * Math.min(1, (1.6 - t) / 0.3);
        return Math.tanh(s * 2.5) * 0.6;
      }),
    );
  }

  lib.set(
    SoundKeys.Win,
    buffer(1.9, (t) => {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      let s = 0;
      for (let k = 0; k < notes.length; k++) {
        const dt = t - k * 0.17;
        if (dt < 0) continue;
        const f = notes[k]!;
        s += (Math.sin(TAU * f * dt) + 0.3 * Math.sin(TAU * f * 2.01 * dt)) * Math.exp(-dt * 2.5) * 0.25;
      }
      return s;
    }),
  );

  {
    // Heavy steel door grinding along its track, ending in a clunk.
    const lp = lowpass(420);
    lib.set(
      SoundKeys.DoorSlide,
      buffer(1.1, (t) => {
        const env = Math.min(1, t / 0.05) * (t < 0.85 ? 1 : Math.exp(-(t - 0.85) * 30));
        const grind = lp(noise()) * 2.2 * (0.75 + 0.25 * Math.sin(TAU * 23 * t));
        const motor = Math.sin(TAU * 62 * t) * 0.25 + Math.sin(TAU * 124 * t) * 0.08;
        const ct = t - 0.88;
        const clunk = ct > 0 ? Math.sin(TAU * 70 * ct) * Math.exp(-ct * 25) * 0.9 : 0;
        return (grind + motor) * env * 0.55 + clunk;
      }),
    );
  }

  lib.set(
    SoundKeys.Pickup,
    buffer(0.5, (t) => {
      const notes = [660, 880, 1320];
      let s = 0;
      for (let k = 0; k < notes.length; k++) {
        const dt = t - k * 0.07;
        if (dt >= 0) s += Math.sin(TAU * notes[k]! * dt) * Math.exp(-dt * 9) * 0.3;
      }
      return s;
    }),
  );

  {
    // Air "whoosh": noise through a band-pass (difference of two low-passes) that sweeps up and down.
    let lo = 0;
    let lower = 0;
    lib.set(
      SoundKeys.Swing,
      buffer(0.28, (t) => {
        const shape = Math.sin((Math.PI * t) / 0.28);
        const a = 1 - Math.exp((-TAU * (500 + 2500 * shape)) / SR);
        lo += a * (noise() - lo);
        lower += 0.05 * (lo - lower);
        return (lo - lower) * shape * 1.4;
      }),
    );
  }

  lib.set(
    SoundKeys.Clang,
    buffer(0.9, (t) => {
      // Inharmonic partials = struck metal.
      const partials = [[523, 1], [1347, 0.6], [2171, 0.45], [3120, 0.3], [4410, 0.2]] as const;
      let s = 0;
      for (const [f, a] of partials) s += Math.sin(TAU * f * t) * a * Math.exp(-t * (4 + f / 600));
      const hit = t < 0.02 ? noise() * (1 - t / 0.02) : 0;
      return (s * 0.32 + hit * 0.8) * Math.min(1, t / 0.001);
    }),
  );

  lib.set(
    SoundKeys.Clink,
    buffer(0.09, (t) => (Math.sin(TAU * 2600 * t) * 0.4 + Math.sin(TAU * 4100 * t) * 0.25 + noise() * 0.3) * Math.exp(-t * 60)),
  );

  {
    const lp = lowpass(260);
    const lp2 = lowpass(1800);
    lib.set(
      SoundKeys.Explosion,
      buffer(2.2, (t) => {
        const boom = Math.sin(TAU * (30 + 70 * Math.exp(-t * 6)) * t) * Math.exp(-t * 2.5) * 1.2;
        const rumble = lp(noise()) * 5 * Math.exp(-t * 1.6);
        const crack = lp2(noise()) * 2 * Math.exp(-t * 14);
        return Math.tanh((boom + rumble + crack) * 1.6) * 0.9 * Math.min(1, t / 0.004);
      }),
    );
  }

  {
    const lp = lowpass(3000);
    lib.set(
      SoundKeys.RobotDown,
      buffer(1.2, (t) => {
        const f = 900 * Math.exp(-t * 2.8) + 40;
        const whine = Math.sin(TAU * f * t) * 0.35 * Math.exp(-t * 1.5);
        const crackle = lp(noise()) * (rng.next() < 0.25 ? 1 : 0.1) * Math.exp(-t * 3) * 0.9;
        return whine + crackle;
      }),
    );
  }

  return lib;
}
