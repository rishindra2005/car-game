# Developer Guide

## Prerequisites

- Node.js 18+ (20/22 recommended) and npm.
- A browser with WebGL 2 (any current browser). WebGPU is used when available
  (recent Chrome/Edge; other browsers depending on version and flags).

## Commands

| Command | What it does |
|---------|--------------|
| `npm install` | Install dependencies (`three`, `vite`, `vitest`, ...) |
| `npm run build:wasm` | Compile `wasm/physics.wat` → `public/physics.wasm` (`scripts/build-wasm.mjs`, uses `wabt`) |
| `npm run dev` | Vite dev server with hot reload (default http://localhost:5173) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve `dist/` (http://localhost:4173) |
| `npm test` | Vitest unit tests (Node environment) |
| `node tests/e2e/smoke.mjs` | Browser smoke test (after `npm run build`); see [TESTING.md](TESTING.md) |

`public/physics.wasm` is optional: without it the game runs the JavaScript fallback.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module map, boot sequence and frame loop, and
[`CONTRACT.md`](../CONTRACT.md) for the exact exported interfaces each module must provide.
Key rule: modules talk through the contract; `src/main.js` is the only place that wires
everything together.

## Module contract — summary

| Module | Exports |
|--------|---------|
| `core/engine.js` | `Engine`, `QUALITY_PRESETS`, `RESOLUTIONS`, `computeRenderSize`, `DynamicResolution` |
| `physics/vehicle.js` | `VehiclePhysics(spec)` → `reset(pos, heading)`, `update(dt, input, track)`, `position`, `heading`, `speed`, `rpm`, `gear`, `nitro`, `drifting`, `driftScore` |
| `physics/wasm.js` | `initWasm()`, `integrateBatch(state, count, dt)` (stride 6: x, z, heading, speed, targetSpeed, steer) |
| `physics/collision.js` | `resolveCarCollision(a, b)` |
| `world/track.js` | `Track(def)` → `spline`, `width`, `heightAt`, `constrain`, `progressAt`, `pointAt`, `tangentAt`, `checkpoints`, `startTransform(slot)` |
| `world/tracks.js` | `TRACKS` |
| `world/city.js` / `environment.js` / `post.js` | `buildCity`, `setupEnvironment`, `setupPost` |
| `world/pathtracer.js` | `PhotoMode(engine)` → `toggle()`, `update()`, `active` |
| `vehicles/catalog.js` | `CARS`, `CLASSES`, `UPGRADES`, `applyUpgrades(spec, levels)`, `getCar`, `upgradePrice` |
| `vehicles/carModel.js` | `buildCarModel(def, quality)`, `updateCarModel(group, physics)` |
| `ai/*` | `RivalDriver`, `TrafficSystem`, `PoliceSystem` |
| `game/*` | `Career`, `STORY`, `EVENTS`, `RaceSession`, `Input`, `ChaseCamera`, challenges |
| `ui/*`, `audio/*` | `HUD`, `Menus`, `AudioSystem` |

## Adding a car

1. Append an entry to `CARS` in `src/vehicles/catalog.js`:

   ```js
   { id: 'mycar', name: 'Original Name', class: 'B', price: 42000, color: 0x3366ff, bodyStyle: 'coupe',
     spec: { mass: 1400, power: 300, maxSpeed: 73, grip: 1.05, wheelbase: 2.6, drag: 0.31,
             gears: [3.2, 2.1, 1.55, 1.2, 1.0, 0.84] } }
   ```

   - `id` must be unique; `name` must be fictional (no real makes/brands).
   - `bodyStyle` is one of `coupe | muscle | super | hatch | suv` — `buildCarModel` and the
     traffic instancer key off it.
   - Units: `mass` kg, `power` kW, `maxSpeed` m/s (km/h ÷ 3.6), `grip` ≈ 0.8–1.4.
   - Keep `class` consistent with performance relative to neighbours.
2. Run `npm test` — catalog tests check ids and spec sanity.
3. The car appears in the garage/shop automatically.

## Adding a track

1. Append to `TRACKS` in `src/world/tracks.js`:

   ```js
   { id: 'my-track', name: 'My Track', district: 'Somewhere', laps: 3, width: 14,
     timeOfDay: 'night', // 'night' | 'dusk' | 'day' | 'rain'
     controlPoints: [[0, 0], [200, 40], [260, 260], [40, 300], [-80, 140]] }
   ```

   Control points are `[x, z]` in meters and form a **closed** Catmull-Rom spline. Avoid
   self-intersections and very sharp angles between consecutive points (the road mesh and
   wall constraint assume a reasonably smooth curve).
2. `buildCity` generates the road, buildings and props around the spline; nothing else is
   needed for rendering.
3. Reference the track from an event via its `id` (`trackId`). Note: event `trackId`s must
   match a `TRACKS[].id` exactly — `main.js` silently falls back to `TRACKS[0]` otherwise.

## Adding an event

Append to `EVENTS` in `src/game/events.js` (use the `ev()` helper for defaults):

```js
ev({ id: 'a2-my-event', name: 'My Event', chapter: 2, type: 'sprint', trackId: 'my-track',
     laps: 1, rivals: 5, difficulty: 0.5,
     reward: { money: 8000, rep: 150 },
     requirements: { events: ['a2-grid-circuit'] },
     objectives: ['Finish 1st'], winPlace: 1 })
```

- `type`: `circuit | sprint | drift | timeTrial | pursuit | knockout`.
- Mode-specific fields: `targetScore` (drift), `targetTime` seconds (timeTrial),
  `surviveTime` seconds (pursuit), `boss` (rival id for story bosses).
- Time trial and pursuit spawn no rivals; pursuit starts with `police.triggerPursuit()`.
- Optional pre/post dialogue comes from `event.dialogue.{pre,post}` or the chapter in `STORY`.

## Building the WebAssembly module

`wasm/physics.wat` is hand-written WebAssembly text. `npm run build:wasm` runs
`scripts/build-wasm.mjs`, which uses the `wabt` npm package to emit `public/physics.wasm`
(Vite serves `public/` at the site root, so the game fetches `/physics.wasm`).

Rules for changing it:

- Keep the memory layout identical to the JS fallback in `src/physics/wasm.js`
  (stride 6 floats per car: `x, z, heading, speed, targetSpeed, steer`).
- Any change must be mirrored in the JS fallback — unit tests compare the two paths when the
  binary is present and test the JS path otherwise.
- Check the console line `wasm=on|fallback` at startup to see which path is active.

## Performance rules

- No allocations inside per-frame code (reuse scratch vectors/quaternions).
- Use `InstancedMesh` for anything repeated; keep draw calls < 300.
- Read `engine.quality` (`drawDistance`, `traffic`, `shadows`, `bloom`, ...) and scale work accordingly.
- Never enable path tracing / accumulation outside Photo Mode.

## Running tests

See [TESTING.md](TESTING.md). In short: `npm test` for unit tests, and
`npm run build && node tests/e2e/smoke.mjs` for the browser smoke test.
