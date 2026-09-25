# Code Maze

A browser 3D survival maze for desktop and mobile. You're trapped in a dark futuristic labyrinth:
find the exit without being caught by patrolling sentinel robots.

**Stack:** TypeScript (strict) · Three.js · Rapier3D (WASM) · Vite · Web Audio API

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN for phone testing)
npm run build      # type-check + production build in dist/
npm run preview    # serve the production build
```

URL flags: `?debug` (debug overlay in production builds), `?touch` (force touch controls),
`?low` (force the mobile graphics preset).

## How to play

New players: pick **GAME PLAY TUTORIAL** on the main menu. It's a hand-built training course that
teaches every action step by step: looking, moving, the lamp, sprinting, sneaking, reading a
sentinel's eye colour, sneaking past a patrol, opening an armory, and fighting with the hammer and
grenades. The game pauses with a coaching card whenever something new comes up (e.g. the moment
you first see a sentinel), then gives you a live objective and a blue beacon showing where to go.
Getting caught in training isn't game over: you retry from the last checkpoint. The script lives in
`src/tutorial/TutorialSteps.ts` (dev builds: F8 skips a step).

| | Desktop | Mobile (landscape) |
|---|---|---|
| Move | WASD / arrows | Left thumb: floating joystick (push lightly = quieter) |
| Look | Mouse (click to lock pointer) | Right thumb: swipe |
| Run / Sneak | Shift / hold C | RUN / SNEAK toggles |
| Lamp | F or right mouse | LAMP |
| Use (escape at exit, open armory doors) | E | USE |
| Hammer smash | Left mouse / Q | SMASH |
| Throw grenade | G | THROW |
| First / third-person view | V | VIEW (top right) |
| Pause | Esc / P | ❚❚ |

**Third-person view.** Press V to switch to an over-the-shoulder camera that shows your character:
dark hair, a long black leather trench coat, a glowing red collar, combat boots and a sci-fi
sledgehammer carried on the shoulder. The character walks, runs, sneaks, slams the hammer and throws
grenades. The camera pulls in when a wall is behind you, and the lamp moves to the character's
chest. The game remembers your choice.

**Armories.** Each level hides a couple of sealed dead ends behind sliding steel doors (Wolfenstein
style, amber ARMORY sign). Press E to open one, walk up to the crate inside and you pick up a
**hammer** (3 hits, one hit destroys a robot at close range) and **2 grenades** (bounce off walls,
blow up after 1.5 s or on hitting a robot, destroying every robot in the blast that isn't behind a
wall). Explosions are loud: surviving robots come to investigate. Robots barge through closed doors,
and your weapons reset each level. Tuning lives in `src/config/armory.config.ts`.

**The lamp is a trade-off.** With it on you see far, but robots spot you from ~2.5× further away and
the battery drains (it flickers when low and recharges slowly when off, depending on difficulty).
Sprinting is loud, walking is audible nearby, and sneaking is almost silent. Robots hear through
walls, but at reduced range.

Robots **patrol**. If they glimpse you or hear something, they **investigate**. Once they're
certain, they **chase**. If they lose you, they **search** the area and then **return** to their
patrol. The meter at the top of the screen shows how suspicious the most alert robot is.

## Debug mode

On automatically in `npm run dev` (lazy-loaded chunk, not downloaded in production unless you
pass `?debug`):
FPS / frame time, draw calls, triangles, physics bodies/colliders, pool usage, player position,
each robot's AI state + suspicion.
`F2` toggles the overlay, `F3` shows collider wireframes, `F4` teleports you to the exit, and
`F6` puts you in front of a robot, `F7` in front of an armory door, and `F8` skips a tutorial step.

## Tuning & content

* All gameplay numbers live in `src/config/*.config.ts`. To add a difficulty, append an entry to
  `difficulty.config.ts`; no code changes needed. Each difficulty also defines a per-level
  progression curve (bigger maze, more and faster robots, less battery, darker).
* To use a GLB robot, put it in `public/models/robot.glb` and register
  `{ key: 'robot', url: 'models/robot.glb' }` in `src/assets/AssetManifest.ts`. Meshes named
  `eye`/`visor`/`glow` get the state-coloured glow. Draco, KTX2 and Meshopt compression are
  supported.
* The player character is built procedurally (`src/player/ProceduralPlayerRig.ts`). To use an
  authored model, put a rigged GLB in `public/models/player.glb` and register
  `{ key: 'player', url: 'models/player.glb' }` in `src/assets/AssetManifest.ts`. It is scaled to
  1.8 m. Clips named `idle` / `walk` / `run` / `crouch` / `attack` / `throw` are blended
  automatically, and the sledgehammer attaches to the right-hand bone (e.g. Mixamo `RightHand`).
  Third-person camera settings are in `player.config.ts → thirdPerson`.
* To add a maze algorithm, implement `MazeGenerator` and call `registerMazeGenerator(...)`, then
  set `maze.config.ts → generator`.

See [ARCHITECTURE.md](ARCHITECTURE.md) for module boundaries, dependency direction, AI state
diagram and performance notes.
