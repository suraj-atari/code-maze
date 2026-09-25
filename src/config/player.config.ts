import type { PlayerConfig } from './types';

export const playerConfig: PlayerConfig = {
  radius: 0.35,
  halfHeight: 0.55,
  eyeHeight: 1.62,
  crouchEyeHeight: 1.05,
  walkSpeed: 3.2,
  sprintSpeed: 5.6,
  crouchSpeed: 1.6,
  acceleration: 12,
  gravity: 20,
  mouseSensitivity: 0.0022,
  touchSensitivity: 0.0055,
  maxPitch: Math.PI * 0.45,
  stamina: {
    max: 5,
    drainPerSecond: 1,
    regenPerSecond: 0.7,
    regenDelay: 1.2,
    minToSprint: 1,
  },
  noiseRadius: { walk: 5.5, sprint: 13, crouch: 1.6 },
  stepLength: { walk: 1.9, sprint: 2.6, crouch: 1.4 },
  headBob: { amplitude: 0.045, frequency: 1.8 },
  interactDistance: 2.2,
  thirdPerson: { distance: 2.2, shoulder: 0.45, height: 0.35, collisionRadius: 0.2 },
};
