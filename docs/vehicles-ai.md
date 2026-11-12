# Vehicles & AI

Owner: vehicles/AI agent. Files: `src/vehicles/catalog.js`, `src/vehicles/carModel.js`, `src/ai/rivals.js`, `src/ai/traffic.js`, `src/ai/police.js`. Tests: `tests/vehicles.test.js`, `tests/ai.test.js`.

Conventions follow CONTRACT.md: Y up, meters, cars face local -Z, `heading` 0 = -Z, positive heading = turn left (CCW). Input `steer` +1 = right.

## Catalog (`vehicles/catalog.js`)
- `CARS`: 10 fictional cars (classes D..S): `{ id, name, class, price, color, bodyStyle, spec:{mass, power(kW), maxSpeed(m/s), grip, wheelbase, drag, gears[]} }`.
- `CLASSES`, `getCar(id)`, `upgradePrice(type, level)`.
- `UPGRADES`: `engine | tires | nitro | weight`, 3 levels each, `{ price, mult:{specKey: factor} }`. Level N uses `levels[N-1]` (not cumulative).
- `applyUpgrades(spec, {engine, tires, nitro, weight})` is pure and returns a new spec (adds `nitroPower`, `nitroCapacity` multipliers, default 1).

## Car model (`vehicles/carModel.js`)
- `buildCarModel(def, quality)` returns a `THREE.Group`. The body is extruded from a side profile per `bodyStyle` (coupe, muscle, super, hatch, suv), with bevels. The paint is a clearcoat `MeshPhysicalMaterial` (`MeshStandardMaterial` when `quality.name === 'low'`). It also has a tinted glass greenhouse, a painted roof, trim bumpers, sills, grille, chrome strip, exhausts and mirrors. Wheels have a tire, sidewall torus, rim, spokes (5, or 3 on low), chrome hub, brake disc and caliper. Head and brake lights are emissive. Super cars get a wing and diffuser, muscle cars a ducktail and hood scoop, SUVs roof rails.
- Geometries and materials (except the per-car light materials) are cached in module maps and shared. `disposeCarModelCache()` frees them.
- `userData`: `wheels[4]` (FL, FR, RL, RR steering pivots; `pivot.userData.spin` rolls), `brakeLights` and `headLights` (Material[]), `body` (inner group used for roll and pitch).
- `updateCarModel(group, physics, dt=1/60)` copies position and quaternion (or heading), spins wheels from `physics.wheelSpin` (radians, or integrates from speed), steers the front wheels with `physics.wheelSteer`, applies visual body roll and pitch, and lights the brake lights when `physics.brake > 0.05` (or `physics.braking` / `physics.input.brake`).

## Rivals (`ai/rivals.js`)
`new RivalDriver(car, track, skill, physics)`; `update(dt, ctx)` returns the input it produced and steps `physics.update(dt, input, ctx.track || track)` unless `stepPhysics = false`.
- Steering: aims at a point a speed-dependent lookahead (8 + 0.45·v m) ahead on the spline, at the rival's lateral offset. A cross-track correction cancels understeer. A speed-scaled P gain with heading-rate damping keeps it stable at speed.
- Speed: corner speed `sqrt(lateralG / curvature)` from the tangent change ahead, over a braking-distance window. The skill speed is `maxSpeed·(0.82 + 0.18·skill)`.
- Rubber-banding: `ctx.playerProgress` (laps + u). The speed factor runs from 0.88 to 1.15 depending on the gap in meters.
- Overtaking: `ctx.others` ([{position}]). A car 0–14 m ahead within 2.2 m sideways shifts the target lateral offset by 3 m.
- `ctx.raceStarted === false` holds the brake. Fields: `progress`, `lap`, `u`, `targetSpeed`, `rubber`, `input`.
- Helpers: `wrapAngle`, `headingTo`, `STEER_SIGN`.

## Traffic (`ai/traffic.js`)
`new TrafficSystem(scene, track, count, quality, {integrate?})`; `update(dt, playerPos)`; `cars`; `getColliders()`; `bump(car, dv)`; `dispose()`.
- One `InstancedMesh` per body style (hatch, coupe, suv, muscle), from merged low-poly geometry with vertex colors and a per-instance color. That makes 4 draw calls.
- 4 lanes: 2 run forward along the spline at offsets +w/8 and +3w/8, and 2 run the other way at -w/8 and -3w/8.
- Kinematics: a stride-6 `Float32Array` goes through `integrateBatch` from `physics/wasm.js` (speed toward target). The distance moved is then projected back onto the lane, so cars never leave the road.
- Cars slow down for a car ahead in the same lane and for the player in front of them. Cars beyond `quality.drawDistance` (capped at 600) respawn 50 m to drawDistance along the spline from the player.
- Each car is `{position, velocity, heading, speed, radius:2.2, mass:1300, lane, u}`, which is compatible with `resolveCarCollision`.

## Police (`ai/police.js`)
`new PoliceSystem(scene|null, track|null, cfgOverrides)`.
- Methods: `update(dt, player{position, speed, heading})`, `triggerPursuit(player?)`, `addHeat(n)`, `setHeat(h)`, `onBusted(cb(heat))`, `onEscaped(cb)`, `onHeatChange(cb(h))`, `getColliders()`, `dispose()`.
- State: `heat` 0..5, `active`, `units`, `bustProgress`, `escapeProgress` (0..1 for the HUD).
- Units: `heat + 1` units (max 6) spawn behind the player. They chase kinematically and form a ring around a slow player. Each has a car model with a red/blue flashing light bar; there are no visuals when `scene` is null.
- Heat rises by 1 every `35 s × heat` of pursuit.
- Busted: player speed under 4 m/s with at least 2 units (or all, if fewer) within 12 m. The bust timer counts to 3 s and decays when the condition breaks.
- Escape: no unit within `140 + 20·heat` m for 10 s. Both busted and escape end the pursuit and set heat to 0.
- All thresholds are in `POLICE_CONFIG`.
