import type { AIConfig } from './types';

export const aiConfig: AIConfig = {
  sensorHz: 10,
  visionRange: 13,
  visionFovDeg: 100,
  darkVisionFactor: 0.4,
  crouchVisionFactor: 0.75,
  proximityRadius: 1.6,
  hearingMultiplier: 1,
  occludedHearingFactor: 0.55,
  suspicionGain: 1.1,
  suspicionDecay: 0.25,
  investigateThreshold: 0.3,
  loseSightSeconds: 3,
  searchSeconds: 14,
  searchRadiusCells: 6,
  lookAroundSeconds: 2.2,
  chaseRepathSeconds: 0.35,
  patrolWaypoints: 4,
  patrolRadiusCells: 14,
  minSpawnDistanceCells: 10,
};
