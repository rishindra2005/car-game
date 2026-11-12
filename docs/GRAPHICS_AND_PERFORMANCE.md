# Graphics and Performance

Velocity Rush targets **60 fps at 1080p "Medium" on moderate hardware** (integrated-GPU class
laptops and up). This document explains what the renderer actually does, what it deliberately
does *not* do, and how to tune it.

## Renderer: WebGPU with automatic WebGL 2 fallback

The engine (`src/core/engine.js`) uses three.js r170.

1. If the renderer setting is `auto` (default) or `webgpu` and `navigator.gpu` exists, it
   dynamically imports `three/webgpu`, creates a `WebGPURenderer` and awaits `init()`.
2. If that throws, or three.js ends up on its internal WebGL backend, it logs a warning and
   creates the classic `WebGLRenderer` (WebGL 2) instead. Setting the renderer to `webgl`
   skips step 1.

Both paths use ACES Filmic tone mapping, sRGB output and PCF soft shadows. The active
backend is printed to the console at startup (`[velocity-rush] renderer=WebGPU|WebGL2 wasm=on|fallback`).

`engine.isWebGPU` reports which backend is active, and the Settings menu lets you force
one. All game materials are standard three.js materials (`MeshStandardMaterial`,
`MeshPhysicalMaterial`), so the scene looks essentially the same on both backends; minor
differences in post-processing are possible.

## Resolution and render scale

Settings → Display offers fixed output resolutions plus native:

| Preset | Size |
|--------|------|
| 720p   | 1280 × 720 |
| 1080p  | 1920 × 1080 |
| 1440p  | 2560 × 1440 |
| 2.5K   | 2560 × 1440 (QHD; "2.5K" is the common marketing name for 1440p) |
| Native | the canvas size × device pixel ratio |

The chosen resolution is the *output* size. Internally the 3D scene is rendered at
`resolution × renderScale` and upscaled to the canvas.

### Dynamic resolution scaling

To hold 60 fps, `DynamicResolution` in `src/core/engine.js` watches an exponentially smoothed
frame time (target 16.7 ms) and adjusts a dynamic scale factor:

- smoothed frame time > 112 % of target → scale drops by 0.05 (floor **0.55**);
- smoothed frame time < 80 % of target → scale rises by 0.025 (ceiling 1.0);
- after each change there is a 30-frame cooldown, and sampling starts only after the first
  60 frames, to avoid visible "pumping".

The final internal size is `outputResolution × userRenderScale × preset.renderScale ×
dynamicScale` (computed by the pure, unit-tested `computeRenderSize()`), with a minimum of
320 × 180. The canvas is then stretched to the window with CSS. HUD and menus are DOM elements
and always display at full resolution, so text stays sharp. Dynamic resolution can be turned
off in Settings (`dynamicResolution: false`) for benchmarking.

## Quality presets

`engine.quality` is a single object consumed by every subsystem:

```js
{ name, renderScale, shadows, shadowMapSize, ssr, bloom, traffic, drawDistance, pathTracing }
```

Values from `QUALITY_PRESETS` in `src/core/engine.js`:

| Preset | Render scale | Shadows (map size) | Bloom | SSR flag | Traffic cars | Draw distance (m) |
|--------|--------------|--------------------|-------|----------|--------------|-------------------|
| Low    | 0.75 | off            | off | off | 12 | 450  |
| Medium | 1.0  | on (1024)      | on  | off | 24 | 700  |
| High   | 1.0  | on (2048)      | on  | on  | 36 | 1000 |
| Ultra  | 1.0  | on (4096)      | on  | on  | 48 | 1400 |

The traffic count is further multiplied by the *traffic density* setting. `pathTracing: true`
only means Photo Mode is *available* on that preset (it is off on Low); it never runs during
gameplay. The `ssr` flag is a hint to subsystems for higher-quality reflections; the
real-time reflection source is still the PMREM environment map described below.

Settings are stored in `localStorage` under `velocityRush.settings`. Changing the renderer
backend (Auto / WebGPU / WebGL) takes effect after a page reload.

## The real-time pipeline

What you see while driving is a conventional, well-optimised **rasterised** pipeline:

- **Physically based materials** — car paint is `MeshPhysicalMaterial` with clearcoat;
  glass, chrome, rubber, asphalt and concrete use metalness/roughness PBR.
- **Image-based lighting / reflections** — a procedural sky is pre-filtered with
  **PMREM** into an environment map, giving glossy reflections on paint, glass and (in the
  rain setting) a wet road. These are environment reflections, not true reflections of
  nearby geometry.
- **Shadow maps** — one directional (sun/moon) shadow map that follows the player, sized by
  preset. Street lights are mostly emissive + cheap point/spot lights without shadows.
- **Post-processing** — bloom on emissive lights (neon, windows, tail lights, nitro),
  ACES-style tone mapping and a vignette. On WebGL this uses `EffectComposer` from
  `three/examples/jsm`.
- **Fog / distance** — exponential fog hides the draw-distance cutoff.

### Why not real-time ray tracing?

Full real-time path tracing at 60 fps is **not feasible in a browser on moderate hardware**.
Neither WebGPU nor WebGL exposes hardware ray-tracing cores, and a compute- or
shader-based path tracer for a dynamic city with dozens of moving cars would need many
samples per pixel plus a rebuilt acceleration structure every frame — orders of magnitude
over a 16 ms budget on an integrated GPU. Velocity Rush therefore does **not** claim
real-time ray tracing. Reflections, soft lighting and glow are approximated with PMREM,
shadow maps and bloom, which is what the hardware can sustain at 60 fps.

## Photo Mode

Press **P** during a race to enter Photo Mode (`src/world/pathtracer.js`):

- Gameplay, physics and AI are paused; the frame is frozen.
- The renderer accumulates many jittered samples of the still frame over successive frames
  and averages them (progressive accumulation). While the camera is still, the image keeps
  refining — edges become smoother and lighting/reflection effects converge.
- Moving the camera resets the accumulation.

This produces **"path-traced-style" stills**: it is an offline-quality effect that is only
possible because the scene is not moving and the frame budget does not matter. It is not a
real-time feature, and it is never active while you drive. Press **P** again to resume.

## WebAssembly for NPC traffic

Civilian traffic uses a batched kinematic integrator: every car's state is packed into a
single `Float32Array` with stride 6 `[x, z, heading, speed, targetSpeed, steer]`, and
`integrateBatch(state, count, dt)` (`src/physics/wasm.js`) advances them all in one call.

- The hot loop is hand-written WebAssembly text (`wasm/physics.wat`), compiled to
  `public/physics.wasm` by `npm run build:wasm` (uses the `wabt` npm package).
- `initWasm()` loads it at startup. If the file is missing, fails to compile, or the browser
  blocks WASM, the game silently uses an **identical JavaScript implementation**. Gameplay is
  the same either way; WASM only saves CPU time.
- The player and rival cars use the full `VehiclePhysics` model in JavaScript.

Traffic cars are drawn with one `InstancedMesh` per body style, so dozens of cars cost only a
handful of draw calls.

## Performance budget and practices

- Draw calls kept under ~300: buildings, lights, trees, barriers and traffic are instanced.
- No per-frame allocations in hot paths (scratch `Vector3`s are reused).
- `dt` is clamped to 1/30 s so a hitch never explodes the physics.
- Draw distance and traffic count scale with the quality preset.

## Troubleshooting

| Symptom | Try |
|---------|-----|
| Low FPS | Lower the quality preset or resolution; make sure dynamic resolution is on; close other GPU-heavy tabs; on laptops, plug in power and use the discrete GPU if present. |
| Black screen / no 3D | Set the renderer to WebGL in Settings and reload. Check `chrome://gpu` that hardware acceleration is enabled. |
| WebGPU unavailable | Expected on some browsers/OSes; the WebGL 2 fallback is used automatically. |
| Blurry image | Dynamic resolution has lowered the render scale; lower the preset or disable dynamic resolution. |
