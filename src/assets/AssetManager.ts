import { TextureLoader, SRGBColorSpace, type Texture, type WebGLRenderer } from 'three';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetEntry, AssetManifest } from './AssetManifest';

export type ProgressCallback = (fraction: number, label: string) => void;

/**
 * Loads and caches models, textures and raw audio. Concurrent requests for the same key are
 * de-duplicated. The GLTF loader (and its Draco/KTX2/Meshopt decoders) is imported lazily, so
 * it only costs bandwidth once a model is actually requested.
 */
export class AssetManager {
  private readonly models = new Map<string, GLTF>();
  private readonly textures = new Map<string, Texture>();
  private readonly audio = new Map<string, ArrayBuffer>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly textureLoader = new TextureLoader();
  private gltfLoader: Promise<GLTFLoader> | null = null;

  constructor(private readonly renderer: WebGLRenderer) {}

  async loadManifest(manifest: AssetManifest, onProgress?: ProgressCallback): Promise<void> {
    const jobs: Array<() => Promise<unknown>> = [];
    const wrap = (entry: AssetEntry, load: () => Promise<unknown>) => () =>
      load().catch((err: unknown) => {
        if (!entry.optional) throw err;
        console.warn(`[assets] optional asset "${entry.key}" failed to load`, err);
      });

    for (const e of manifest.models) jobs.push(wrap(e, () => this.loadModel(e.key, e.url)));
    for (const e of manifest.textures) jobs.push(wrap(e, () => this.loadTexture(e.key, e.url)));
    for (const e of manifest.audio) jobs.push(wrap(e, () => this.loadAudio(e.key, e.url)));

    let done = 0;
    const total = jobs.length;
    if (total === 0) {
      onProgress?.(1, 'assets');
      return;
    }
    await Promise.all(
      jobs.map((job) =>
        job().then(() => {
          done++;
          onProgress?.(done / total, 'assets');
        }),
      ),
    );
  }

  loadModel(key: string, url: string): Promise<GLTF> {
    return this.cached(this.models, `model:${key}`, key, async () => {
      const loader = await this.getGltfLoader();
      return loader.loadAsync(url);
    });
  }

  loadTexture(key: string, url: string): Promise<Texture> {
    return this.cached(this.textures, `texture:${key}`, key, async () => {
      const tex = await this.textureLoader.loadAsync(url);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      return tex;
    });
  }

  loadAudio(key: string, url: string): Promise<ArrayBuffer> {
    return this.cached(this.audio, `audio:${key}`, key, async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.arrayBuffer();
    });
  }

  /** Registers a runtime-generated texture so it shares the cache/disposal path. */
  registerTexture(key: string, texture: Texture): void {
    this.textures.set(key, texture);
  }

  getModel(key: string): GLTF | undefined {
    return this.models.get(key);
  }

  getTexture(key: string): Texture | undefined {
    return this.textures.get(key);
  }

  requireTexture(key: string): Texture {
    const t = this.textures.get(key);
    if (!t) throw new Error(`[assets] texture "${key}" not loaded`);
    return t;
  }

  getAudio(key: string): ArrayBuffer | undefined {
    return this.audio.get(key);
  }

  dispose(): void {
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    this.models.clear();
    this.audio.clear();
  }

  private cached<T>(store: Map<string, T>, id: string, key: string, load: () => Promise<T>): Promise<T> {
    const hit = store.get(key);
    if (hit) return Promise.resolve(hit);
    const pending = this.inflight.get(id) as Promise<T> | undefined;
    if (pending) return pending;
    const p = load()
      .then((value) => {
        store.set(key, value);
        return value;
      })
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, p);
    return p;
  }

  private getGltfLoader(): Promise<GLTFLoader> {
    this.gltfLoader ??= (async () => {
      const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/loaders/DRACOLoader.js'),
        import('three/examples/jsm/loaders/KTX2Loader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      // Decoder WASM files are referenced by the loaders via import.meta.url, so Vite bundles
      // them and they are only fetched when a compressed asset is actually decoded.
      const loader = new GLTFLoader();
      loader.setDRACOLoader(new DRACOLoader());
      loader.setKTX2Loader(new KTX2Loader().detectSupport(this.renderer));
      loader.setMeshoptDecoder(MeshoptDecoder);
      return loader;
    })();
    return this.gltfLoader;
  }
}
