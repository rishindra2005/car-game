# Velocity Rush

An original, story-driven street-racing game that runs in the browser — built with
**three.js r170**, **WebGPU (with automatic WebGL 2 fallback)** and a little **WebAssembly**.
All cars, tracks, characters, textures and audio are procedural and fictional; there are no
external assets and no real-world brands.

## Quick start

```bash
npm install
npm run build:wasm   # optional: compiles wasm/physics.wat -> public/physics.wasm (JS fallback otherwise)
npm run dev          # open the printed URL (default http://localhost:5173)
```

Production build:

```bash
npm run build && npm run preview   # http://localhost:4173
```

Tests:

```bash
npm test                     # Vitest unit tests
node tests/e2e/smoke.mjs     # Playwright browser smoke test (after npm run build)
```

## Features

- **Career / story mode** across four acts (Harbor, Downtown, Canyon & Industrial, Skyline) with original characters, act bosses and dialogue.
- **Six race modes:** circuit, sprint, drift, time trial, police pursuit and knockout.
- **10 fictional cars** in classes D → S (hatch, coupe, muscle, SUV, super) with engine,
  tire, nitro and weight upgrades; money and garage persisted in `localStorage`.
- **Procedural neon city** with multiple tracks, night/dusk/day/rain lighting, instanced
  buildings, street lights and props.
- **Arcade-sim vehicle physics** with gears, nitro, handbrake drifting and drift scoring.
- **AI:** rubber-banded rival racers, two-way civilian traffic and a heat-based police system.
- **Rendering:** PBR materials (clearcoat paint), PMREM environment reflections, shadow maps,
  bloom and ACES tone mapping; quality presets Low/Medium/High/Ultra.
- **Resolution presets** 720p / 1080p / 1440p / 2.5K / native plus **dynamic resolution
  scaling** targeting 60 fps.
- **Photo Mode** (`P`): progressive accumulation for clean, "path-traced-style" stills.
  (Real-time path tracing at 60 fps is not feasible in browsers on moderate hardware; the
  gameplay renderer is rasterised — see the graphics doc.)
- **WebAssembly** batched traffic integration with an identical JavaScript fallback.
- **Synthesized audio** (WebAudio engine sound, tire squeal, nitro, music loop).
- **Keyboard and gamepad** support.

## Documentation

| Document | For |
|----------|-----|
| [Player Guide](docs/PLAYER_GUIDE.md) | Getting started, career, garage, upgrades, modes, police, tips |
| [Controls](docs/CONTROLS.md) | Keyboard and gamepad bindings |
| [Story Walkthrough](docs/story-walkthrough.md) | Chapter-by-chapter story (spoilers) |
| [Graphics & Performance](docs/GRAPHICS_AND_PERFORMANCE.md) | Renderer, presets, dynamic resolution, Photo Mode, WASM |
| [Architecture](docs/ARCHITECTURE.md) | Module map, boot sequence, frame loop |
| [Developer Guide](docs/DEVELOPER_GUIDE.md) | Adding cars/tracks/events, building WASM, conventions |
| [Testing](docs/TESTING.md) | Unit tests, e2e smoke test, QA checklist |
| [Module Contract](CONTRACT.md) | Exact interfaces between modules |

## Browser support

Any current desktop browser with WebGL 2. WebGPU is used automatically where available
(e.g. recent Chrome/Edge) and the game falls back to WebGL 2 otherwise. Audio starts after
the first click or key press (browser autoplay policy).

## License / content

All content is original. No real vehicle manufacturers, brands, logos or characters are used.
