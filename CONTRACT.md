# Velocity Rush — module contract (all agents MUST follow)

Original street-racing game (NOT a clone of any existing franchise: no real brand names, car makes, characters or logos).
Stack: three.js 0.170 (`three` for WebGL, `three/webgpu` for WebGPURenderer), Vite, Vitest. Plain ES modules, no TypeScript.
All geometry/textures are PROCEDURAL (no external assets, no network). Performance target: 60 fps on moderate hardware
(integrated GPU class) at 1080p "medium". Avoid per-frame allocations; use InstancedMesh for repeated objects; keep draw calls < 300.

Coordinate system: Y up, meters, cars face local -Z forward. dt in seconds (clamped to 1/30).

## Shared interfaces

### src/core/engine.js (OWNER: lead) — already defined
`export class Engine { scene, camera, renderer, quality, isWebGPU, onUpdate(fn(dt,t)), start() }`
`quality` = `{ name, renderScale, shadows:bool, shadowMapSize, ssr:bool, bloom:bool, traffic:int, drawDistance, pathTracing:bool }`

### src/physics/ (OWNER: physics agent)
- `vehicle.js`: `export class VehiclePhysics { constructor(spec); reset(pos:Vector3, heading:number); update(dt, input, track); get position():Vector3; get heading():number (radians, 0 = -Z); get speed():number (m/s); get rpm(); get gear(); get state() (plain obj snapshot); quaternion:Quaternion; wheelSpin:number[4]; wheelSteer:number; nitro (0..1); drifting:bool; driftScore }`
  - `input` = `{ throttle:0..1, brake:0..1, steer:-1..1, handbrake:bool, nitro:bool }`
  - `spec` = `{ mass, power (kW), maxSpeed (m/s), grip, wheelbase, drag, gears:number[] }` (see vehicles/catalog.js)
  - `track` provides `track.heightAt(x,z)` and `track.constrain(pos, vel) -> { hit:bool, normal }` (wall collision)
- `wasm.js`: `export async function initWasm()` loads `/physics.wasm` (built from wasm/physics.wat via `npm run build:wasm`, script uses the `wabt` npm package) providing hot-path integration (e.g. tire force / batched NPC integration). MUST gracefully fall back to an identical JS implementation if WASM fails. `export function integrateBatch(Float32Array state, count, dt)` for NPC kinematics: per-car stride 6 [x,z,heading,speed,targetSpeed,steer].
- `collision.js`: `export function resolveCarCollision(a, b)` simple circle/OBB push-apart between VehiclePhysics-like bodies {position, velocity, radius, mass}.

### src/world/ (OWNER: world agent)
- `track.js`: `export class Track { constructor(def); spline:CatmullRomCurve3 (closed); width; heightAt(x,z); constrain(pos, vel); progressAt(pos)-> 0..1 along spline; pointAt(u)-> Vector3; tangentAt(u); checkpoints:number[] (u values); startTransform(slot)-> {position, heading} }`
- `tracks.js`: `export const TRACKS = [{ id, name, district, laps, controlPoints:[[x,z],...], width, timeOfDay:'night'|'dusk'|'day'|'rain' }]` (at least 5 tracks, all on one city map is fine).
- `city.js`: `export function buildCity(scene, track, quality) -> { update(dt, camera) , dispose() }` procedural city: road mesh with lane markings, sidewalks, instanced buildings with emissive windows, street lights, barriers, trees, signs. LOD/draw distance per quality.
- `environment.js`: `export function setupEnvironment(engine, timeOfDay) -> { update(dt), dispose() }`: sky, sun/moon, fog, PMREM env map, wet-road reflections in rain, particles for rain.
- `post.js`: `export function setupPost(engine) -> { render(), setSize(w,h) }` bloom/tonemapping/vignette/motion feel; WebGL path uses EffectComposer from `three/examples/jsm`, WebGPU path may use `three/webgpu` PostProcessing or just render.
- `pathtracer.js`: Photo Mode: progressive path tracer for a still frame (CPU-light approach: use a simple WebGL fragment-shader path tracer over a BVH-free scene proxy OR accumulate SSR+AO samples). Must be OFF during gameplay; toggled with key P. Honest about being a photo mode.

### src/vehicles/ + src/ai/ (OWNER: vehicles agent)
- `vehicles/catalog.js`: `export const CARS = [{ id, name (fictional), class:'D'|'C'|'B'|'A'|'S', price, spec:{...}, color, bodyStyle:'coupe'|'muscle'|'super'|'hatch'|'suv' }]` ≥ 8 cars + `export const UPGRADES` (engine, tires, nitro, weight; each with levels & spec multipliers) + `export function applyUpgrades(spec, upgrades)`.
- `vehicles/carModel.js`: `export function buildCarModel(def, quality) -> THREE.Group` with `userData.wheels[4]`, `userData.brakeLights`, `userData.headLights` — detailed procedural body (MeshPhysicalMaterial clearcoat paint, glass, chrome, tires with rims, light emissives). `export function updateCarModel(group, physics)` (wheel spin/steer, body roll, brake lights).
- `ai/rivals.js`: `export class RivalDriver { constructor(car, track, skill 0..1, physics); update(dt, ctx) }` racing line following with rubber-banding, overtaking, uses VehiclePhysics.
- `ai/traffic.js`: `export class TrafficSystem { constructor(scene, track, count, quality); update(dt, playerPos); cars }` civilian NPC cars using InstancedMesh per body style, lane following both directions, uses integrateBatch from physics/wasm.js.
- `ai/police.js`: `export class PoliceSystem { constructor(scene, track); heat 0..5; update(dt, player); triggerPursuit(); onBusted(cb); onEscaped(cb) }` with light bars.

### src/game/ + src/ui/ + src/audio/ (OWNER: game agent)
- `game/story.js`: `export const STORY` acts/chapters with dialogue lines (original characters), `game/career.js`: `export class Career { save(); load(); money; garage; unlocked; completeEvent(id, place, time) }` persisted to localStorage (key `velocityRush.save.v1`).
- `game/events.js`: `export const EVENTS = [{ id, chapter, type:'circuit'|'sprint'|'drift'|'timeTrial'|'pursuit'|'knockout', trackId, laps, rivals, reward, requirements, objectives }]` ≥ 15 events; `game/challenges.js`: daily/side challenges (e.g. "reach 280 km/h", "drift 20000 pts").
- `game/race.js`: `export class RaceSession { constructor({engine, event, track, playerCar, rivals}); update(dt); positions; lap; finished; results }` lap/checkpoint/position logic, countdown, wrong-way detection.
- `game/input.js`: `export class Input { constructor(target=window); state (same shape as physics input) ; update() }` keyboard (WASD/arrows, Space handbrake, Shift nitro, C camera, P photo, Esc pause) + Gamepad API.
- `game/camera.js`: `export class ChaseCamera { constructor(camera); setMode(i); update(dt, target, physics) }` chase/hood/bumper/cinematic, speed FOV.
- `ui/hud.js`, `ui/menus.js`: DOM overlay (index.html has `<div id="ui">`). Main menu, story/dialogue screens, garage/upgrade shop, event map, settings (quality preset + resolution 720p/1080p/1440p/2.5K(2560x1440)/native + render scale + renderer WebGPU/WebGL), pause, results. Speedometer, tach, nitro bar, minimap (canvas), position/lap/time, heat meter.
- `audio/audio.js`: WebAudio synthesized engine (rpm-driven oscillators+noise), tire squeal, nitro whoosh, collision thump, simple music loop. Starts on first user gesture.

### Tests: each agent writes Vitest tests in `tests/<area>.test.js` for pure logic (no WebGL needed; environment `node`).
### Docs: each agent writes `docs/<area>.md` describing their module.
