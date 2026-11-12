# Physics (`src/physics/`)

Coordinate system: Y up, meters, car faces local -Z. `heading` 0 = -Z, positive heading = turn **left** (CCW seen from above).
Forward vector = `(-sin h, 0, -cos h)`.

## `vehicle.js` — `VehiclePhysics`

Arcade-sim **bicycle model** (front/rear axle, rear-wheel drive).

```js
const car = new VehiclePhysics(spec);      // spec = { mass, power(kW), maxSpeed(m/s), grip, wheelbase, drag(Cd), gears[] }
car.reset(new Vector3(x, y, z), heading);
car.update(dt, input, track);              // input = { throttle, brake, steer(-1..1, +1 = right), handbrake, nitro }
```

* **Sub-stepping**: `update` clamps dt to 1/30 and splits it into `ceil(dt/(1/120))` equal sub-steps (each <= 1/120 s), so it is
  stable and frame-rate independent between 1/120 and 1/30. No allocations per frame.
* **Weight transfer**: axle loads shift with longitudinal acceleration (CG height 0.5 m).
* **Tires**: slip angles per axle, linear cornering stiffness, clamped to `grip * Fz` (rear uses a friction circle with drive force).
  Below 2.5 m/s a kinematic bicycle model is used (blended up to 5 m/s) to avoid singularities.
* **Engine/gearbox**: power-based drive force with an rpm torque curve, traction-limited at the rear axle; final drive is computed so the
  top gear reaches the 7500 rpm redline at `spec.maxSpeed`. Auto up-shift at 93% redline, down-shift under 42%, 0.16 s torque cut while
  shifting. A soft limiter guarantees speed <= `maxSpeed` (x1.08 with nitro). Holding brake at a standstill for 0.35 s selects reverse
  (`gear === -1`, max 12 m/s); throttle selects 1st again.
* **Resistance**: aero drag `0.5 * 1.225 * drag * 2.2 m² * v²`, rolling resistance 1.5% of weight. Brakes up to 0.95 g.
* **Handbrake**: rear grip x0.42, rear braking, reduced yaw damping -> drift. Drifting = speed > 9 m/s and body slip > 0.14 rad.
  `driftCombo` accumulates `speed * slip * 12` pts/s; it is banked into `driftScore` 0.4 s after the slide ends, and cancelled by a wall hit.
* **Nitro**: `nitro` 0..1, drains 0.22/s while active (`/ spec.nitroCapacity`), recharges 0.035/s and faster while drifting.
  Adds +55% power (`* spec.nitroPower`). Optional spec fields `nitroPower`, `nitroCapacity` default to 1.
* **Terrain**: `position.y = track.heightAt(x, z)`; terrain pitch/roll are sampled around the car and baked into `quaternion`.
* **Walls**: `track.constrain(position, velocity)` is called every sub-step; on `{hit, normal}` the inward normal velocity is removed
  (slight bounce) and the speed is scaled by `1 - (0.05 + 0.45 * impactAngle)`. `onWall` / `lastImpact` (m/s) are set for audio/FX.
  `normal` may be any `{x, z}` pointing back into the track. `track` may be `null` (flat ground, no walls).

### Read-only outputs
| member | meaning |
|---|---|
| `position` (Vector3), `velocity` (Vector3, world) | `velocity` may be edited externally (collisions); it is re-read each update |
| `heading`, `speed` (signed m/s), `forwardSpeed`, `yawRate`, `slipAngle` | |
| `rpm`, `gear` (-1 reverse, 1..n) | |
| `quaternion` | heading + terrain slope (apply to car root) |
| `pitch`, `roll` | suspension body motion (rad, + nose up / + right side up) for visuals only |
| `wheelSpin[4]` (FL, FR, RL, RR rad), `wheelSteer` (rad, + left) | |
| `nitro`, `nitroActive`, `drifting`, `driftScore`, `driftCombo`, `totalDrift` | |
| `onWall`, `lastImpact`, `radius` (2.3), `mass` | |
| `state` | reused plain object snapshot of all of the above (do not hold references across frames) |

`setSpec(spec)` re-applies a spec (e.g. after upgrades) without resetting state.

## `wasm.js` — batched NPC kinematics

```js
await initWasm();                 // fetches /physics.wasm; also accepts bytes / WebAssembly.Module / url. Resolves true|false, never throws
integrateBatch(state, count, dt); // Float32Array, stride 6: [x, z, heading, speed, targetSpeed, steer]
isWasmActive();                   // true when the WASM path is used
integrateBatchJS(state, count, dt); // the pure JS fallback (identical results)
```

Per car: speed moves toward `targetSpeed` (+4 m/s² / -8 m/s²), `heading += speed * steer / 2.6 * dt`, then position advances along the
forward vector. Both implementations use the same f64 polynomial sine and operation order, so results are bit-identical
(verified in tests). Source: `wasm/physics.wat`, built with `npm run build:wasm` (`scripts/build-wasm.mjs`, uses `wabt`) to `public/physics.wasm`.

## `collision.js`

`resolveCarCollision(a, b) -> impactSpeed` — circle vs circle in XZ for `{position, velocity, radius, mass}` bodies
(VehiclePhysics qualifies). Splits penetration by inverse mass, applies a restitution (0.25) impulse plus a little tangential friction,
calls `notifyImpact(speed)` on bodies that have it. Returns 0 when not touching / already separating.

## Tests
`npx vitest run tests/physics.test.js`
