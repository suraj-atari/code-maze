import type { AssetManager } from '../assets/AssetManager';
import type { WeaponModels } from '../weapons/WeaponModels';
import { GltfPlayerRig } from './GltfPlayerRig';
import type { PlayerRig } from './PlayerRig';
import { ProceduralPlayerRig } from './ProceduralPlayerRig';

/**
 * Builds the third-person player character. Like RobotModelFactory, a loaded 'player' GLB
 * (see AssetManifest) takes priority; otherwise the procedural character is used.
 */
export class PlayerModelFactory {
  constructor(
    private readonly assets: AssetManager,
    private readonly weapons: WeaponModels,
  ) {}

  create(): PlayerRig {
    const gltf = this.assets.getModel('player');
    return gltf ? new GltfPlayerRig(gltf, this.weapons) : new ProceduralPlayerRig(this.weapons);
  }
}
