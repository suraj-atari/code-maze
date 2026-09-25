import type { ArmoryConfig, WeaponsConfig } from './types';

export const armoryConfig: ArmoryConfig = {
  perLevel: 4,
  roomsPerDeadEnd: 0.7,
  maxRooms: 14,
  nullifierShare: 0.3,
  minStartDistanceCells: 3,
  spacingCells: 3,
  doorOpenSeconds: 0.9,
  robotOpenDistance: 1.7,
  pickupRadius: 1.4,
  loot: { grenades: 2, hammerHits: 3 },
  nullifierCharges: 1,
};

export const weaponsConfig: WeaponsConfig = {
  maxGrenades: 5,
  maxHammerHits: 6,
  hammer: { reach: 2.4, coneDeg: 100, cooldown: 0.55 },
  grenade: {
    throwSpeed: 10,
    throwLift: 2.5,
    gravity: 14,
    bounce: 0.45,
    radius: 0.09,
    fuseSeconds: 1.5,
    blastRadius: 4.5,
    cooldown: 0.8,
  },
  nullifier: { maxCharges: 3, radius: 11, stunSeconds: 4, cooldown: 1 },
};
