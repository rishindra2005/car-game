// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import { VehiclePhysics } from '../src/physics/vehicle.js';
import { initWasm, integrateBatch, integrateBatchJS, isWasmActive, STRIDE } from '../src/physics/wasm.js';
import { resolveCarCollision } from '../src/physics/collision.js';

const SPEC = { mass: 1300, power: 280, maxSpeed: 70, grip: 1.1, wheelbase: 2.6, drag: 0.3, gears: [3.3, 2.2, 1.6, 1.25, 1.0, 0.82] };
const flat = { heightAt: () => 0, constrain: () => ({ hit: false, normal: null }) };
const input = (o = {}) => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, ...o });

function run(car, seconds, inp, dt = 1 / 60, track = flat) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) car.update(dt, inp, track);
}

describe('VehiclePhysics', () => {
  it('accelerates forward (-Z at heading 0)', () => {
    const car = new VehiclePhysics(SPEC);
    car.reset(new Vector3(0, 0, 0), 0);
    run(car, 3, input({ throttle: 1 }));
    expect(car.speed).toBeGreaterThan(10);
    expect(car.position.z).toBeLessThan(-10);
    expect(Math.abs(car.position.x)).toBeLessThan(0.5);
  });

  it('top speed is bounded by spec.maxSpeed', () => {
    const car = new VehiclePhysics(SPEC);
    car.reset(new Vector3(), 0);
    let max = 0;
    for (let i = 0; i < 60 * 90; i++) { car.update(1 / 60, input({ throttle: 1 }), flat); max = Math.max(max, car.speed); }
    expect(max).toBeLessThanOrEqual(SPEC.maxSpeed + 0.5);
    expect(max).toBeGreaterThan(SPEC.maxSpeed * 0.8);
  });

  it('braking stops the car', () => {
    const car = new VehiclePhysics(SPEC);
    car.reset(new Vector3(), 0);
    run(car, 5, input({ throttle: 1 }));
    expect(car.speed).toBeGreaterThan(20);
    let t = 0;
    while (car.speed > 0.05 && t < 8) { car.update(1 / 60, input({ brake: 1 }), flat); t += 1 / 60; }
    expect(t).toBeLessThan(5);
    expect(Math.abs(car.speed)).toBeLessThan(0.5);
    // releasing everything keeps it stopped
    run(car, 1, input({}));
    expect(Math.abs(car.speed)).toBeLessThan(0.1);
  });

  it('steering changes heading (right input turns right / negative heading)', () => {
    const car = new VehiclePhysics(SPEC);
    car.reset(new Vector3(), 0);
    run(car, 2, input({ throttle: 1 }));
    const h0 = car.heading;
    run(car, 1, input({ throttle: 0.5, steer: 1 }));
    expect(car.heading).toBeLessThan(h0 - 0.2);
    const car2 = new VehiclePhysics(SPEC);
    car2.reset(new Vector3(), 0);
    run(car2, 2, input({ throttle: 1 }));
    run(car2, 1, input({ throttle: 0.5, steer: -1 }));
    expect(car2.heading).toBeGreaterThan(0.2);
  });

  it('gearbox shifts up and rpm stays in range', () => {
    const car = new VehiclePhysics(SPEC);
    car.reset(new Vector3(), 0);
    expect(car.gear).toBe(1);
    run(car, 12, input({ throttle: 1 }));
    expect(car.gear).toBeGreaterThan(2);
    expect(car.rpm).toBeGreaterThan(800);
    expect(car.rpm).toBeLessThan(8000);
  });

  it('is stable across dt 1/120 .. 1/30 and follows terrain', () => {
    const hill = { heightAt: (x, z) => Math.sin(z * 0.05) * 3, constrain: () => ({ hit: false }) };
    for (const dt of [1 / 120, 1 / 60, 1 / 30]) {
      const car = new VehiclePhysics(SPEC);
      car.reset(new Vector3(), 0);
      for (let i = 0; i < Math.round(8 / dt); i++) car.update(dt, input({ throttle: 1, steer: Math.sin(i * dt), handbrake: i * dt > 4 && i * dt < 5 }), hill);
      expect(Number.isFinite(car.position.x)).toBe(true);
      expect(Math.abs(car.speed)).toBeLessThan(SPEC.maxSpeed + 1);
      expect(car.position.y).toBeCloseTo(hill.heightAt(car.position.x, car.position.z), 5);
      expect(Math.abs(car.roll)).toBeLessThan(0.2);
      expect(Math.abs(car.pitch)).toBeLessThan(0.2);
    }
  });

  it('handbrake turn produces drifting and drift score', () => {
    const car = new VehiclePhysics(SPEC);
    car.reset(new Vector3(), 0);
    run(car, 4, input({ throttle: 1 }));
    let drifted = false;
    for (let i = 0; i < 120; i++) { car.update(1 / 60, input({ throttle: 1, steer: 1, handbrake: i < 40 }), flat); drifted ||= car.drifting; }
    run(car, 1, input({}));
    expect(drifted).toBe(true);
    expect(car.driftScore).toBeGreaterThan(0);
  });

  it('nitro depletes while used and boosts acceleration', () => {
    const a = new VehiclePhysics(SPEC), b = new VehiclePhysics(SPEC);
    a.reset(new Vector3(), 0); b.reset(new Vector3(), 0);
    run(a, 6, input({ throttle: 1 }));
    run(b, 6, input({ throttle: 1 }));
    run(a, 3, input({ throttle: 1 }));
    run(b, 3, input({ throttle: 1, nitro: true }));
    expect(b.nitro).toBeLessThan(0.5);
    expect(b.speed).toBeGreaterThan(a.speed);
  });

  it('wall collision via track.constrain removes speed', () => {
    const wall = {
      heightAt: () => 0,
      constrain(pos, vel) { if (pos.z < -30) { pos.z = -30; return { hit: true, normal: { x: 0, y: 0, z: 1 } }; } return { hit: false }; },
    };
    const car = new VehiclePhysics(SPEC);
    car.reset(new Vector3(), 0);
    run(car, 4, input({ throttle: 1 }), 1 / 60, wall);
    expect(car.position.z).toBeGreaterThanOrEqual(-30.001);
    expect(car.velocity.z).toBeGreaterThanOrEqual(-0.5);
  });
});

describe('WASM integrateBatch', () => {
  let ok = false;
  beforeAll(async () => {
    const bytes = readFileSync(resolve(__dirname, '../public/physics.wasm'));
    ok = await initWasm(bytes);
  });

  it('loads and matches the JS fallback exactly', () => {
    expect(ok).toBe(true);
    expect(isWasmActive()).toBe(true);
    const N = 64;
    const a = new Float32Array(N * STRIDE);
    for (let i = 0; i < N; i++) {
      const p = i * STRIDE;
      a[p] = i * 3.1 - 50; a[p + 1] = i * -1.7; a[p + 2] = (i * 0.37) % 6 - 3;
      a[p + 3] = i % 25; a[p + 4] = (i * 7) % 30; a[p + 5] = ((i % 9) - 4) * 0.05;
    }
    const b = a.slice();
    for (let s = 0; s < 300; s++) { integrateBatch(a, N, 1 / 60); integrateBatchJS(b, N, 1 / 60); }
    let maxErr = 0;
    for (let i = 0; i < a.length; i++) maxErr = Math.max(maxErr, Math.abs(a[i] - b[i]));
    expect(maxErr).toBeLessThan(1e-4);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('kinematics move cars forward toward target speed', () => {
    const s = new Float32Array([0, 0, 0, 0, 10, 0]);
    for (let i = 0; i < 300; i++) integrateBatch(s, 1, 1 / 60);
    expect(s[3]).toBeCloseTo(10, 3);
    expect(s[1]).toBeLessThan(-20);
    expect(Math.abs(s[0])).toBeLessThan(1e-3);
  });
});

describe('resolveCarCollision', () => {
  it('pushes overlapping cars apart and exchanges momentum', () => {
    const a = { position: new Vector3(0, 0, 0), velocity: new Vector3(10, 0, 0), radius: 2, mass: 1000 };
    const b = { position: new Vector3(3, 0, 0), velocity: new Vector3(0, 0, 0), radius: 2, mass: 1000 };
    const impact = resolveCarCollision(a, b);
    expect(impact).toBeGreaterThan(0);
    expect(b.position.x - a.position.x).toBeGreaterThanOrEqual(4 - 1e-6);
    expect(b.velocity.x).toBeGreaterThan(0);
    expect(a.velocity.x).toBeLessThan(10);
  });

  it('works with VehiclePhysics bodies', () => {
    const a = new VehiclePhysics(SPEC), b = new VehiclePhysics(SPEC);
    a.reset(new Vector3(0, 0, 0), 0); b.reset(new Vector3(1, 0, 0), 0);
    resolveCarCollision(a, b);
    expect(b.position.x - a.position.x).toBeGreaterThan(a.radius + b.radius - 1e-6);
  });

  it('ignores separated cars', () => {
    const a = { position: new Vector3(0, 0, 0), velocity: new Vector3(), radius: 2, mass: 1 };
    const b = { position: new Vector3(10, 0, 0), velocity: new Vector3(), radius: 2, mass: 1 };
    expect(resolveCarCollision(a, b)).toBe(0);
  });
});
