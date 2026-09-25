import type { LampConfig } from './types';

export const lampConfig: LampConfig = {
  batterySeconds: 120,
  drainPerSecond: 1,
  rechargePerSecond: 2,
  rechargeDelay: 1.5,
  intensity: 45,
  range: 16,
  angleDeg: 32,
  penumbra: 0.55,
  decay: 2,
  color: 0xfff1d6,
  flickerBelow: 0.25,
  minOutput: 0.35,
  minBatteryToTurnOn: 0.03,
};
