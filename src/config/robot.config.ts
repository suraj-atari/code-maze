import type { RobotConfig } from './types';

export const robotConfig: RobotConfig = {
  radius: 0.42,
  height: 1.9,
  patrolSpeed: 1.6,
  investigateSpeed: 2.4,
  searchSpeed: 2.1,
  chaseSpeed: 4.3,
  returnSpeed: 1.9,
  turnSpeed: 4.5,
  catchRadius: 1.05,
  eyeLight: { intensity: 22, range: 10, angleDeg: 28 },
  stateColors: {
    patrol: 0x2fd8ff,
    investigate: 0xffd23a,
    search: 0xff8a1f,
    chase: 0xff1f2f,
    return: 0x6f9bff,
  },
};
