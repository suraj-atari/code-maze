export interface AssetEntry {
  readonly key: string;
  readonly url: string;
  /** Optional assets fail silently and the game falls back to procedural content. */
  readonly optional?: boolean;
}

export interface AssetManifest {
  readonly models: readonly AssetEntry[];
  readonly textures: readonly AssetEntry[];
  readonly audio: readonly AssetEntry[];
}

/**
 * Assets loaded before the main menu. Everything the vertical slice needs is generated
 * procedurally (textures, sounds, robot mesh), so the manifest starts empty.
 *
 * To use authored content, drop files into /public and register them, e.g.
 *   models: [{ key: 'robot', url: 'models/robot.glb' }]
 * `RobotModelFactory` automatically prefers a loaded 'robot' model over the procedural one.
 * Draco / KTX2 / Meshopt compressed GLBs are supported out of the box.
 */
export const assetManifest: AssetManifest = {
  models: [],
  textures: [],
  audio: [],
};
