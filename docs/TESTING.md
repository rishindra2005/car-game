# Testing

Velocity Rush has two layers of automated tests.

## 1. Unit tests (Vitest, Node)

```bash
npm test            # = vitest run
npx vitest          # watch mode
npx vitest run tests/physics.test.js   # a single file
```

Configuration lives in `vitest.config.js`:

- `environment: 'node'` — no DOM, no WebGL. Tests must only exercise pure logic.
- `include: ['tests/**/*.test.js']`, with `tests/e2e/**` excluded.

Each module owner keeps tests in `tests/<area>.test.js`. Typical subjects:

| Area | What is tested |
|------|----------------|
| physics | `VehiclePhysics` accelerates, brakes, respects `maxSpeed`, gear changes; `integrateBatch` JS fallback matches expectations; `resolveCarCollision` separates overlapping bodies |
| world | `Track` spline is closed, `progressAt(pointAt(u)) ≈ u`, `constrain` pushes positions back inside walls, every entry in `TRACKS` builds |
| vehicles / ai | `CARS` has ≥ 8 unique ids and sane specs, `applyUpgrades` scales specs monotonically, rival/traffic logic |
| game | `EVENTS` reference valid tracks, `Career` save/load round-trip, money and unlock rules, race position ordering |

Guidelines for writing tests:

- Import modules directly (`import { Track } from '../src/world/track.js'`). `three` math classes
  (`Vector3`, `CatmullRomCurve3`, ...) work fine in Node; renderers do not.
- Do not touch `window`, `document`, `localStorage` or `WebGLRenderingContext` at import time.
  If a module needs storage, inject it or stub it in the test (`globalThis.localStorage = ...`).
- Prefer deterministic inputs: fixed `dt` (e.g. `1/60`), no `Math.random` without a seed.
- The WASM path is optional in tests; the JS fallback must produce the same results so it can
  be tested without building `public/physics.wasm`.

## 2. End-to-end smoke test (Playwright, headless Chromium)

`tests/e2e/smoke.mjs` loads the real game in a browser and drives it.

```bash
npm run build
node tests/e2e/smoke.mjs
# or against a running dev server:
E2E_URL=http://localhost:5173/ node tests/e2e/smoke.mjs
```

It requires the `playwright` package and a Chromium build (`npx playwright install chromium`
if it is not already available). The script resolves `playwright` locally first, then from the
global npm root.

What it does:

1. Starts `npx vite preview --port 4173` (unless `E2E_URL` is set) and waits for it to respond.
2. Launches Chromium with `--enable-unsafe-webgpu --use-angle=swiftshader --enable-unsafe-swiftshader`
   so it renders on machines without a GPU (software rasterizer — expect low FPS; FPS is
   reported, not asserted).
3. Records console errors (reported only) and uncaught page errors (fail the test).
4. Waits for `window.__VR_READY === true`.
5. Calls `window.__VR_TEST.startQuickRace()`, waits 3 s and logs `window.__VR_TEST.stats()`
   (`{ fps, frame, renderer, playerSpeed }`).
6. Holds `ArrowUp` for 2 s and asserts `playerSpeed > 0` and that `frame` advanced.
7. Saves `tests/e2e/screenshot.png` and exits `0` on success, `1` on any failure.

### Test hooks

The hooks used above are installed by `src/main.js` and are intended for automation only:

| Global | Meaning |
|--------|---------|
| `window.__VR_READY` | `true` once the renderer is initialised and the main menu is interactive |
| `window.__VR_TEST.startQuickRace(eventId?)` | Skips menus and starts the given event (default: `EVENTS[0]`) with the first car in `CARS` |
| `window.__VR_TEST.stats()` | `{ fps, frame, renderer: 'webgpu' \| 'webgl2', wasm, playerSpeed, renderSize, dynScale }` (speed in m/s) |
| `window.__VR_TEST.engine` | The live `Engine` instance |

## Manual QA checklist

- Both renderers: switch Settings → renderer between WebGPU and WebGL, reload, and check the
  console line `[velocity-rush] renderer=...` and that the scene looks equivalent.
- Every resolution preset (720p, 1080p, 1440p, 2.5K, native) and every quality preset.
- Complete one event of each type: circuit, sprint, drift, time trial, pursuit, knockout.
- Career persists after a page reload; clearing `localStorage` key `velocityRush.save.v1` resets it.
- Photo Mode (`P`) enters/exits cleanly and gameplay resumes.
- Gamepad connect/disconnect mid-race.
- Rename/remove `public/physics.wasm` and confirm traffic still runs (JS fallback).
