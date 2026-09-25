# Code Maze — Architecture

Browser 3D survival maze (TypeScript · Three.js · Rapier3D · Vite · Web Audio), desktop + mobile.

## Layering & dependency direction

Dependencies only point **downwards**. Lower layers never import from higher ones.

```
                       main.ts
                          │
                     core/Game  (composition root: builds everything, owns the frame loop)
      ┌──────────┬────────┼─────────┬───────────┬──────────┬──────────┐
      ▼          ▼        ▼         ▼           ▼          ▼          ▼
     ui/      input/   level/    audio/     lighting/  effects/   debug/ (lazy chunk)
  (DOM only) (DOM in)    │      (GameAudio) (Lighting,  (Particles)
      │          │       ├───────────┐        LampLight)
      │          │       ▼           ▼
      │          │     robots/     player/
      │          │       │  ╲        │
      │          │       ▼   ╲       ▼
      │          │     maze/ ──────▶ physics/ (Rapier wrapper)
      │          │       │
      ▼          ▼       ▼
   core/EventBus, core/GameStateManager, pooling/, config/, utils/   ← shared foundations
```

Rules that keep it modular:

* **Game logic never touches the DOM.** `Player`, `Robot*`, `Maze*`, `Level*` talk to the UI only
  through the typed `EventBus` and a plain `HudModel` object that `Game` hands to `UIManager`.
* **Maze data ≠ maze visuals ≠ maze physics.**
  `MazeGenerator → MazeData → { MazeRenderer, MazePhysics, Pathfinder }`. The AI only reads `MazeData`
  (grid line-of-sight + BFS), so AI is independent of both rendering and Rapier.
* **All tunables live in `src/config/`.** `resolveLevelConfig(difficulty, levelIndex)` merges the base
  configs with a `DifficultyConfig` and its progression curve, so adding a difficulty is data-only.
* **Game states** are owned by `GameStateManager` with an explicit transition table — no scattered flags.
* **Composition over inheritance.** `Robot` = `RobotController` + `RobotSensor` + `RobotStateMachine`
  + `RobotView`; its behaviour is a set of *stateless* `State` objects registered by `RobotBehaviour`
  that read/write a per-robot blackboard (`RobotMemory`). States are shared by all robots → zero
  per-robot allocations.

## Module map

| Folder        | Responsibility |
|---------------|----------------|
| `config/`     | Config interfaces + defaults (player, lamp, robot, AI, maze, audio, graphics, difficulty) and `resolveLevelConfig`. |
| `core/`       | `Game` (composition root), `GameLoop` (rAF, clamped dt), `GameStateManager`, `EventBus`, `GameEvents`. |
| `rendering/`  | `SceneManager` – renderer, scene, camera, resize, pixel-ratio cap. |
| `physics/`    | `PhysicsSystem` – Rapier world, body/collider factories, character controller, debug buffers. |
| `input/`      | `InputManager` merges `KeyboardMouseInput` + `TouchInput` (virtual joystick, look pad, buttons) into one `InputState`. |
| `assets/`     | `AssetManager` – cached/deduped loading of GLTF (lazy loader import, Draco/KTX2/Meshopt), textures, audio; `ProceduralTextures`. |
| `maze/`       | `MazeData`, `MazeGenerator` interface + `RecursiveBacktrackerGenerator` (with braiding), `MazeRenderer` (chunked `InstancedMesh`), `MazePhysics` (merged colliders), `Pathfinder` (allocation-free BFS), `Maze` facade. |
| `player/`     | `Player` (intent, stamina, noise, footsteps), `PlayerController` (Rapier kinematic capsule), `FirstPersonCamera`, `Lamp` (battery model, flicker). |
| `robots/`     | `Robot`, `RobotController`, `RobotSensor`, `RobotStateMachine`, `RobotBehaviour`, `states/*`, `RobotView` (LOD), `RobotModelFactory`, `RobotSpawner`, `RobotManager` (pooled). |
| `lighting/`   | `LightingSystem` (ambient darkness, fog, pooled flash lights), `LampLight` (camera spotlight). |
| `effects/`    | `ParticleSystem` (single `Points` draw call, pooled particles), `EffectsManager`. |
| `audio/`      | `AudioManager` (context unlock, buses, pooled voices, positional audio), `SoundLibrary` (procedural buffers), `GameAudio` (event → sound bridge, loops, heartbeat). |
| `level/`      | `LevelManager` (build/teardown/progression), `Level`, `ExitZone`. |
| `pooling/`    | `ObjectPool<T>`, `ObjectPoolManager` (stats for debug). |
| `ui/`         | `UIManager` + screens (loading, menu, HUD, pause, game over, level complete). DOM lives only here and in `input/`. |
| `debug/`      | `DebugSystem` — dynamically imported only in dev or with `?debug`, so production bundles don't include it. |

## Frame (state = Playing)

```
input.poll() → player.update() → level.update() (exit/interact) → robots.update() (AI ticks at sensorHz)
→ physics.step() → camera/lamp sync → lighting/effects/audio update → HUD model → render
```

## Robot AI

```
          sees (suspicion≥investigate) / hears noise
  Patrol ─────────────────────────────────────────▶ Investigate ──(nothing found)──▶ Return ──▶ Patrol
    │  ▲                                                │                               │
    │  └──────────────────── arrived ───────────────────┼───────────────────────────────┘
    │ suspicion = 1                                     │ suspicion = 1
    ▼                                                   ▼
  Chase ◀──────────────────────────── (any state) ── Chase ──(lost sight > loseSightSeconds)──▶ Search ──(timeout)──▶ Return
```

* **Vision**: range × (lamp off → `darkVisionFactor`) × (crouching → `crouchVisionFactor`), FOV cone,
  grid line-of-sight, plus a short proximity sense. Seeing the player raises *suspicion* (faster when close).
* **Hearing**: the player emits a noise radius (sneak < walk < sprint); walls attenuate it.
* **The lamp is a trade-off**: you see further, but robots spot you from ~2.5× further away and the battery drains.

## Performance notes

* Walls: one `InstancedMesh` per spatial chunk (8×8 cells) so frustum culling works per chunk; wall
  cells that touch no floor are not rendered at all. Colliders merge horizontal wall runs.
* No per-frame allocations in hot paths: reused vectors, pooled particles/voices/flash lights/robots,
  typed-array BFS with visit stamps, stateless AI states.
* AI perception runs at `sensorHz` (staggered), not every frame. Pathfinding only on state change / repath timer.
* Constant light count per level (lights are dimmed, never added/removed) → no shader recompiles mid-game.
* Mobile quality preset: capped pixel ratio, no shadows, no robot spot lights, fewer particles, equal-power panning.

## Milestones

1. **Vertical slice (this milestone)** — FPS player, small generated maze, darkness, battery lamp,
   robots with full state machine, detection, chase, exit, win/lose, HUD, desktop + mobile controls, debug overlay.
2. Collectibles (batteries via pooled pickups), hiding spots, noise-making distractions.
3. GLB robot/prop models (drop into `public/models/` and register in `assets/AssetManifest.ts`), KTX2 textures.
4. More generators (rooms + corridors, Prim's), robot variants (sentry, hunter), settings screen.
