# World module (`src/world/`)

Everything is procedural. There are no external assets and no network calls. `track.js`, `tracks.js` and `city.js` run in node without a DOM; textures are `DataTexture`s.
The scene graph only uses stock materials (`MeshStandardMaterial`, `MeshBasicMaterial`, `PointsMaterial`, `LineBasicMaterial`), so the same objects render under `WebGLRenderer` and `WebGPURenderer`. Custom GLSL appears only in WebGL-only fullscreen passes (`post.js` vignette, `pathtracer.js`).

## tracks.js
`export const TRACKS = [{ id, name, district, laps, width, timeOfDay, biome, elevation, seed, controlPoints: [[x,z],...] }]`, `export function getTrackDef(id)`.
`biome` is optional (`'city'|'coast'|'canyon'|'industrial'`, default `'city'`) and selects the scenery in `city.js`.

| id | name | district | length | time | biome |
|---|---|---|---|---|---|
| harbor-loop | Saltgate Harbor Loop | Saltgate Docks | ~1.6 km | day | coast |
| canyon-run | Lumen Canyon Climb | Lumen Heights | ~2.4 km | dusk (golden hour) | canyon |
| downtown-grid | Cobalt Grid Sprint | Cobalt Quarter | ~3.1 km | rain (overcast day) | city |
| industrial-zone | Ember Row Foundry Esses | Ember Row | ~1.9 km | dusk | industrial |
| skyline-sprint | Verdant Skyline Sprint | Verdant Ring | ~2.8 km | day | city |
| glasswater-bay | Glasswater Causeway | Glasswater Bay | ~2.1 km | night | coast |

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
`buildCity(scene, track, quality) -> { group, lamps, biome, groundAt(x,z), update(dt, camera), dispose() }`

A natural open-world look: coastal city, countryside and a mountain road, chosen per track by `def.biome`.

- **Road:** asphalt with grain and subtle patchiness, white dashed lane lines, a yellow centre line, solid white edge lines, a checkered start line, red/white curbs on corners only (radius under 130 m), and grey steel guardrails with posts. The guardrail sits where the `constrain` wall is.
- **Verge:** raised concrete sidewalks in the city, coast and industrial biomes; a dirt shoulder in the canyon.
- **Terrain:** one vertex-coloured mesh. Grass with colour variation and dry patches, paved ground inside the built-up area, rock on slopes, sand at the shoreline. Away from the road it rises into rolling hills; in the canyon the slopes start about 40 m from the road. `groundAt` gives this scenery height and is not for physics (`track.heightAt` is the road field).
- **Distance:** two low-poly mountain rings (green-grey near, blue-grey far). Coast tracks get a sea plane on the -Z side, and the mountains drop away there.
- **Buildings:** concrete, brick, sandstone, white stucco and blue-grey office glass. Heights fall away from downtown, and the built-up radius and height depend on the biome (the canyon has almost none; industrial has wide low sheds). Windows are plain glass by day and glow warm only at dusk and night. Buildings are **merged into one geometry per 500 m chunk** instead of InstancedMesh, which gives correct window UVs without custom shaders; chunks are culled by `quality.drawDistance` and by the frustum.
- **Vegetation:** one InstancedMesh per species with per-instance tint: round broadleaf, conifer (dominant in the canyon), palm (dominant on the coast), and bushes. Street trees line the verge and woodland is scattered denser near the road. Counts scale with quality (roughly 300-2200 at medium, more in the canyon).
- **Street lamps:** warm white, lit only at dusk and night, with additive light pools and 0 / 3 / 6 real `PointLight`s (low / medium / high) that follow the lamps nearest the camera. By day there are no pools and no point lights.
- About 14-24 meshes per track. Road and sidewalk materials set `userData.wetable = true` for rain.

## environment.js
`setupEnvironment(engine, timeOfDay = 'day') -> { sun, hemi, preset, update(dt), dispose() }`, `PRESETS`.

- **Sky:** vertex-coloured dome (BackSide `MeshBasicMaterial`, `fog:false`). Day is blue zenith to pale horizon haze; dusk is a warm orange and pink golden hour; rain is an overcast day; night is moonlit with stars. A warm glow is blended in around the sun.
- **Clouds:** soft instanced puffs on a slowly drifting layer (none when overcast).
- **Light:** a bright warm `DirectionalLight` sun (or moon) and a `HemisphereLight` with sky blue above and warm grey below. When `quality.shadows` is on, the sun casts PCF-soft shadows at `shadowMapSize` with a 180 m frustum that follows the camera and snaps to texels.
- **Haze:** light `FogExp2` in the horizon colour, scaled by draw distance. ACES tone mapping with exposure tuned per preset so day scenes are bright.
- WebGL: a PMREM environment from `RoomEnvironment`, with `scene.environmentIntensity` per preset.
- Rain: 1.5k / 3.5k / 6k streaks (`LineSegments`, CPU-wrapped around the camera). Materials tagged `wetable` get lower roughness and darker albedo so the road looks wet.
- The mountains sit about 1.5-2 km out, so `camera.far` should be at least ~3000 for them to show.

## post.js
`setupPost(engine) -> { render(), setSize(w,h), setSpeedFeel(0..1), dispose() }`

- WebGL: `EffectComposer` (HalfFloat, MSAA 4× except on low) → `RenderPass` → `UnrealBloomPass` (when `quality.bloom`; subtle, high threshold so daylight does not glow) → vignette and chromatic-aberration speed feel → `OutputPass` (ACES and sRGB).
- WebGPU: `renderer.render(scene, camera)`.
- `render()` hands off to `engine.photoMode.update()` while `engine.photoMode.active`.

## pathtracer.js (Photo Mode)
`class PhotoMode { constructor(engine); toggle(force?) -> bool; get active; update(); reset(); get progress; maxSamples=256; aperture; focusDistance; dispose() }`

This is **progressive stochastic accumulation**, not a full path tracer. Each frame renders the scene once with Halton sub-pixel jitter (anti-aliasing), a thin-lens camera offset (depth of field), and the sun jittered over a disc (soft area-light shadows). The result is averaged into a float render target as a running mean and then tone-mapped to screen. Accumulation restarts when the camera moves and stops after `maxSamples`. It is WebGL only: on WebGPU, `toggle()` logs a notice and returns false.

Integration: set `engine.photoMode = new PhotoMode(engine)`, bind key P to `toggle()`, and pause gameplay updates while it is `active`. `post.render()` then routes to it automatically.

## Tests
Run `npx vitest run tests/world.test.js`. It covers the track definitions, loop length and grade, `progressAt` monotonicity on every track, `pointAt`/`tangentAt`, `heightAt`, `constrain`, `startTransform`, the headless city build with its draw-call budget, the headless environment for each time of day, and the PhotoMode WebGPU refusal.
