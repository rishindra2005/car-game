# World module (`src/world/`)

Everything is procedural. There are no external assets and no network calls. `track.js`, `tracks.js` and `city.js` run in node without a DOM; textures are `DataTexture`s.
The scene graph only uses stock materials (`MeshStandardMaterial`, `MeshBasicMaterial`, `PointsMaterial`, `LineBasicMaterial`), so the same objects render under `WebGLRenderer` and `WebGPURenderer`. Custom GLSL appears only in WebGL-only fullscreen passes (`post.js` vignette, `pathtracer.js`).

## tracks.js
`export const TRACKS = [{ id, name, district, laps, width, timeOfDay, elevation, seed, controlPoints: [[x,z],...] }]`, `export function getTrackDef(id)`.

| id | name | district | length | time |
|---|---|---|---|---|
| harbor-loop | Harbor Neon Loop | Saltgate Docks | ~1.6 km | night |
| canyon-run | Lumen Canyon Climb | Lumen Heights | ~2.4 km | dusk |
| downtown-grid | Cobalt Grid Sprint | Cobalt Quarter | ~3.1 km | rain |
| industrial-zone | Ember Row Foundry Esses | Ember Row | ~1.9 km | night |
| skyline-sprint | Verdant Skyline Sprint | Verdant Ring | ~2.8 km | day |
| glasswater-bay | Glasswater Causeway | Glasswater Bay | ~2.1 km | dusk |

## track.js
`export class Track`, `export function makeHeightField(amp, seed)`.

- Elevation comes from one smooth analytic field `H(x,z)`, with an amplitude of 2–7 m and wavelengths of 700–1300 m, so grades stay below 10%. The road, terrain, sidewalks and building bases all use `H`, which makes `heightAt(x,z)` O(1) and exact anywhere on the map.
- `spline`: a closed centripetal `CatmullRomCurve3`. Also exposes `length`, `width`, `halfWidth`, `wallOffset` (= width/2 + 0.6, the furthest a body centre can be from the centreline), `laps`, `timeOfDay`, `bounds`, `checkpoints` (8 evenly spaced u values) and `samples`/`tangents` (Float32Array, one every ~2 m).
- `pointAt(u, target?)`, `tangentAt(u, target?)`, `headingAt(u)`. u wraps.
- `progressAt(pos)` → 0..1 and `lateralAt(pos)` → signed metres (+ = right of the driving direction). Both use a spatial hash plus segment projection and allocate nothing.
- `nearest(x,z)` → a shared `{u, lateral, dist, cx, cz, tx, tz, index}`.
- `constrain(pos, vel?, radius=0)` → a shared `{hit, normal, lateral}`. It clamps `pos` to `wallOffset - radius`, removes the outward velocity with a 0.3 restitution bounce, and returns a `normal` that points back toward the road.
- `startTransform(slot)` → `{position, heading, u}`. Two columns, 8 m rows, behind u=0. Heading convention: 0 = -Z, forward = (-sin h, 0, -cos h).

## city.js
`buildCity(scene, track, quality) -> { group, lamps, update(dt, camera), dispose() }`

- Road ribbon with an asphalt grain texture, dashed lane dividers, a yellow centre line, solid edge lines, a checkered start line, red/white curbs, jersey barriers with hazard stripes (their inner face lines up with the `constrain` wall), raised sidewalks, and terrain that follows `H`.
- Buildings: track-side rows aligned to the road, plus background city blocks that get taller toward downtown. Facades use a procedural window `map` and an `emissiveMap` (lit windows), and the emissive intensity depends on the time of day. Buildings are **merged into one geometry per 400 m chunk** instead of InstancedMesh. Merging gives correctly scaled window UVs without custom shaders (WebGPU-safe), and each chunk is culled by `quality.drawDistance` in `update` as well as by the frustum.
- Instanced: neon signs, lamp poles and arms, lamp heads (emissive, picked up by bloom), additive light pools on the road, tree trunks and crowns.
- Real lights: 0 / 3 / 6 `PointLight`s (low / medium / high, at night or dusk only). Every 0.2 s they move to the lamps nearest the camera.
- Road, sidewalk and ground materials set `userData.wetable = true`, which the environment uses for rain.

## environment.js
`setupEnvironment(engine, timeOfDay) -> { sun, hemi, preset, update(dt), dispose() }`, `PRESETS`.

- Vertex-coloured gradient sky dome (BackSide `MeshBasicMaterial`, `fog:false`), stars, a moon or sun disc, `HemisphereLight`, and a `DirectionalLight` sun or moon. When `quality.shadows` is on, the sun casts PCF-soft shadows at `shadowMapSize` with a 180 m frustum that follows the camera and snaps to texels.
- `FogExp2` scaled by draw distance. ACES tone mapping and exposure per preset.
- WebGL: a PMREM environment from `RoomEnvironment`, with `scene.environmentIntensity` per preset.
- Rain: 1.5k / 3.5k / 6k streaks (`LineSegments`, CPU-wrapped around the camera). Materials tagged `wetable` get about 0.22× roughness, darker albedo and a stronger env reflection, so the road looks wet.

## post.js
`setupPost(engine) -> { render(), setSize(w,h), setSpeedFeel(0..1), dispose() }`

- WebGL: `EffectComposer` (HalfFloat, MSAA 4× except on low) → `RenderPass` → `UnrealBloomPass` (when `quality.bloom`) → vignette and chromatic-aberration speed feel → `OutputPass` (ACES and sRGB).
- WebGPU: `renderer.render(scene, camera)`.
- `render()` hands off to `engine.photoMode.update()` while `engine.photoMode.active`.

## pathtracer.js (Photo Mode)
`class PhotoMode { constructor(engine); toggle(force?) -> bool; get active; update(); reset(); get progress; maxSamples=256; aperture; focusDistance; dispose() }`

This is **progressive stochastic accumulation**, not a full path tracer. Each frame renders the scene once with Halton sub-pixel jitter (anti-aliasing), a thin-lens camera offset (depth of field), and the sun jittered over a disc (soft area-light shadows). The result is averaged into a float render target as a running mean and then tone-mapped to screen. Accumulation restarts when the camera moves and stops after `maxSamples`. It is WebGL only: on WebGPU, `toggle()` logs a notice and returns false.

Integration: set `engine.photoMode = new PhotoMode(engine)`, bind key P to `toggle()`, and pause gameplay updates while it is `active`. `post.render()` then routes to it automatically.

## Tests
Run `npx vitest run tests/world.test.js`. It covers the track definitions, loop length and grade, `progressAt` monotonicity on every track, `pointAt`/`tangentAt`, `heightAt`, `constrain`, `startTransform`, the headless city build with its draw-call budget, the headless environment for each time of day, and the PhotoMode WebGPU refusal.
