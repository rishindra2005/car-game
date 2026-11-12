# Architecture

Velocity Rush is a single-page browser game: plain ES modules, three.js r170, bundled by
Vite. There are no external assets — geometry, textures and audio are all generated at
runtime. The authoritative interface spec is [`CONTRACT.md`](../CONTRACT.md); this document
explains how the pieces fit together.

## Module map

```
index.html            #app container, #ui overlay, #boot loading text
src/main.js           composition root: boot, race lifecycle, per-frame update, test hooks
src/core/engine.js    Engine (renderer, scene, camera, loop), quality presets, dynamic resolution
src/physics/          VehiclePhysics, collision, WASM batch integrator (+ JS fallback)
src/world/            Track + TRACKS, procedural city, environment/sky, post-processing, Photo Mode
src/vehicles/         car catalog + upgrades, procedural car models
src/ai/               rival drivers, civilian traffic, police
src/game/             career/save, story, events, challenges, race session, input, chase camera
src/ui/               HUD and menus (DOM overlay)
src/audio/            WebAudio synthesized engine/SFX/music
wasm/physics.wat      WebAssembly text source → public/physics.wasm (npm run build:wasm)
tests/                Vitest unit tests (Node) + tests/e2e/smoke.mjs (Playwright)
```

## Dependency direction

```
main.js ─┬─> core/engine
         ├─> world/*      (depends on three, core quality object)
         ├─> physics/*    (pure math; Track is passed in, not imported)
         ├─> vehicles/*   (catalog is pure data; carModel builds three.js meshes)
         ├─> ai/*         (uses physics/ + world Track instance)
         ├─> game/*       (race logic, career, input, camera)
         ├─> ui/*         (DOM only; receives plain data from main.js)
         └─> audio/*
```

Modules do not reach into each other's internals; `main.js` wires them together. Pure-logic
modules (physics, catalog, events, career, track math, `computeRenderSize`,
`DynamicResolution`) avoid DOM/WebGL access so they can be unit-tested in Node.

## Boot sequence (`src/main.js`)

1. Load settings from `localStorage` (`velocityRush.settings`) and the career save
   (`velocityRush.save.v1`).
2. `initWasm()` — tries to load `/physics.wasm`; bounded by a 1.5 s timeout, falls back to JS.
3. `engine.init()` — WebGPU renderer if available, otherwise WebGL 2 (see
   [GRAPHICS_AND_PERFORMANCE.md](GRAPHICS_AND_PERFORMANCE.md)).
4. Create `ChaseCamera`, post-processing (`setupPost`), `PhotoMode`, `HUD`, `Menus`.
5. Build an attract-mode backdrop (night environment, city, an orbiting showroom car).
6. `engine.start()`, show main menu, set `window.__VR_READY = true`.

## Race lifecycle

`onStartEvent(event, carId)` → optional pre-race dialogue → `startEvent()`:

- `disposeWorld()` tears down the previous scene.
- `new Track(def)` from `TRACKS`, `setupEnvironment(engine, timeOfDay)`, `buildCity(...)`.
- Player: `VehiclePhysics(applyUpgrades(spec, upgrades))` + `buildCarModel()`, placed at
  `track.startTransform(0)`.
- Rivals (none for time trial/pursuit): `VehiclePhysics` + `RivalDriver` with skill scaled
  by chapter.
- `TrafficSystem` (not in time trial) and `PoliceSystem` (pursuit events or `event.police`).
- `RaceSession` tracks countdown, laps, checkpoints, positions and results.

When `race.finished`, or police fire `onBusted` / `onEscaped` (pursuit), `finishRace()`
calls `career.completeEvent(id, place, time)`, saves, and shows dialogue/results.

## Per-frame update

`Engine.start()` runs `renderer.setAnimationLoop`. Each frame (dt clamped to 1/30 s):

1. `input.update()` — merge keyboard + gamepad into `{ throttle, brake, steer, handbrake, nitro }`
   plus edge-triggered pause/camera/photo/reset flags.
2. If Photo Mode is active, only `photo.update()` runs (gameplay frozen).
3. Player physics (`VehiclePhysics.update(dt, input, track)`), car model sync.
4. Rivals: `RivalDriver.update`, pairwise `resolveCarCollision`.
5. Traffic: `TrafficSystem.update` (batched via `integrateBatch`), near-field player collisions.
6. Police, `RaceSession.update`, city LOD, environment, chase camera.
7. Audio (rpm/throttle/speed/drift/nitro) and HUD data.
8. Render via `post.render()`; FPS bookkeeping; `DynamicResolution.sample()` may trigger a resize.

## Rendering

See [GRAPHICS_AND_PERFORMANCE.md](GRAPHICS_AND_PERFORMANCE.md) for the renderer selection,
quality presets, dynamic resolution, PBR/PMREM/shadow/bloom pipeline and Photo Mode.

## Persistence

| Key | Contents |
|-----|----------|
| `velocityRush.save.v1` | Career: money, garage (owned cars + upgrade levels), unlocked/completed events |
| `velocityRush.settings` | Quality preset, resolution, render scale, renderer, dynamic resolution, volume, traffic density |

## Conventions

- Y up, meters, cars face local −Z; heading 0 = −Z.
- Speeds in m/s internally; the HUD shows km/h.
- No per-frame allocations in hot paths; repeated objects use `InstancedMesh`; < 300 draw calls.
- Everything original — no real car makes, brands, characters or logos.
