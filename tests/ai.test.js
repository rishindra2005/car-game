import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Physics wasm module may be written in parallel; mock with a JS kinematic integrator.
vi.mock('../src/physics/wasm.js', () => ({
  initWasm: async () => false,
  integrateBatch: (s, count, dt) => {
    for (let i = 0; i < count; i++) {
      const o = i * 6;
      s[o + 3] += Math.sign(s[o + 4] - s[o + 3]) * Math.min(Math.abs(s[o + 4] - s[o + 3]), 4 * dt);
      s[o + 2] += s[o + 5] * dt;
      s[o] += -Math.sin(s[o + 2]) * s[o + 3] * dt;
      s[o + 1] += -Math.cos(s[o + 2]) * s[o + 3] * dt;
    }
  },
}));

import { RivalDriver, wrapAngle } from '../src/ai/rivals.js';
import { TrafficSystem } from '../src/ai/traffic.js';
import { PoliceSystem } from '../src/ai/police.js';
import { CARS } from '../src/vehicles/catalog.js';

// Circular track stub, radius R
function circleTrack(R = 200, width = 14) {
  return {
    width,
    spline: { getLength: () => 2 * Math.PI * R },
    pointAt: (u) => new THREE.Vector3(R * Math.cos(u * 2 * Math.PI), 0, R * Math.sin(u * 2 * Math.PI)),
    tangentAt: (u) => new THREE.Vector3(-Math.sin(u * 2 * Math.PI), 0, Math.cos(u * 2 * Math.PI)),
    progressAt: (p) => { const a = Math.atan2(p.z, p.x) / (2 * Math.PI); return ((a % 1) + 1) % 1; },
    heightAt: () => 0,
    constrain: () => ({ hit: false }),
  };
}

// Tiny kinematic VehiclePhysics stub: steer +1 = right (heading decreases)
class StubPhysics {
  constructor() { this._pos = new THREE.Vector3(); this._h = 0; this._v = 0; this.nitro = 1; }
  reset(p, h) { this._pos.copy(p); this._h = h; this._v = 0; }
  get position() { return this._pos; }
  get heading() { return this._h; }
  get speed() { return this._v; }
  update(dt, input) {
    this._v += (input.throttle * 8 - input.brake * 15) * dt;
    this._v = Math.max(0, this._v);
    this._h -= input.steer * 1.2 * dt * Math.min(1, this._v / 5);
    this._pos.x += -Math.sin(this._h) * this._v * dt;
    this._pos.z += -Math.cos(this._h) * this._v * dt;
  }
}

describe('RivalDriver', () => {
  it('steers back toward the track when displaced outward', () => {
    const track = circleTrack();
    const r = new RivalDriver(CARS[3], track, 0.8, new StubPhysics());
    // at u=0 point (200,0,0) tangent +Z; heading facing +Z is PI. Offset outward (x larger) => must turn toward -x.
    const pos = new THREE.Vector3(206, 0, 0);
    const steer = r.computeSteer(pos, Math.PI, 20);
    // facing +Z, the right-hand side is -X (center of circle) => steer right (> 0)
    expect(steer).toBeGreaterThan(0);
    const steerIn = r.computeSteer(new THREE.Vector3(194, 0, 0), Math.PI, 20);
    expect(steerIn).toBeLessThan(0);
  });

  it('drives around the track staying near the road', () => {
    const track = circleTrack();
    const ph = new StubPhysics();
    ph.reset(new THREE.Vector3(200, 0, 0), Math.PI);
    const r = new RivalDriver(CARS[3], track, 0.9, ph);
    r.targetLateral = 0;
    let maxErr = 0;
    for (let i = 0; i < 60 * 40; i++) {
      r.update(1 / 60, {});
      maxErr = Math.max(maxErr, Math.abs(Math.hypot(ph.position.x, ph.position.z) - 200));
    }
    expect(maxErr).toBeLessThan(track.width / 2);
    expect(r.progress).toBeGreaterThan(0.3);
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 5);
    expect(wrapAngle(0.5 + 4 * Math.PI)).toBeCloseTo(0.5, 5);
  });

  it('drives the real VehiclePhysics around the track (if present)', async () => {
    let mod;
    try { mod = await import('../src/physics/vehicle.js'); } catch (e) { return; }
    const track = circleTrack(150, 16);
    const ph = new mod.VehiclePhysics(CARS[4].spec);
    ph.reset(new THREE.Vector3(150, 0, 0), Math.PI);
    const r = new RivalDriver(CARS[4], track, 0.7, ph);
    r.targetLateral = 0;
    let maxErr = 0;
    for (let i = 0; i < 60 * 30; i++) {
      r.update(1 / 60, { track });
      maxErr = Math.max(maxErr, Math.abs(Math.hypot(ph.position.x, ph.position.z) - 150));
    }
    expect(ph.speed).toBeGreaterThan(5);
    expect(r.progress).toBeGreaterThan(0.2);
    expect(maxErr).toBeLessThan(track.width / 2);
  });

  it('rubber-bands: faster target when player is far ahead', () => {
    const track = circleTrack(2000);
    const mk = () => { const p = new StubPhysics(); p.reset(new THREE.Vector3(2000, 0, 0), Math.PI); return new RivalDriver(CARS[3], track, 0.5, p); };
    const a = mk(), b = mk();
    a.update(1 / 60, { playerProgress: 0.3 });
    b.update(1 / 60, { playerProgress: -0.3 });
    expect(a.rubber).toBeGreaterThan(b.rubber);
  });
});

describe('TrafficSystem', () => {
  it('keeps cars in lanes near the road in both directions and respawns near player', () => {
    const track = circleTrack(300, 16);
    const scene = new THREE.Scene();
    const ts = new TrafficSystem(scene, track, 16, { drawDistance: 300 });
    expect(scene.children.filter((c) => c.isInstancedMesh).length).toBeGreaterThan(0);
    const player = new THREE.Vector3(300, 0, 0);
    let maxErr = 0;
    const dirs = new Set();
    for (let i = 0; i < 600; i++) {
      ts.update(1 / 30, player);
      for (const c of ts.cars) {
        maxErr = Math.max(maxErr, Math.abs(Math.hypot(c.position.x, c.position.z) - 300));
        dirs.add(c.lane.dir);
        expect(c.position.distanceTo(player)).toBeLessThanOrEqual(300 + 1);
      }
    }
    expect(maxErr).toBeLessThan(track.width / 2 + 0.5);
    expect(dirs.size).toBe(2);
    expect(ts.cars[0].speed).toBeGreaterThan(0);
  });
});

describe('PoliceSystem', () => {
  const fakePlayer = () => ({ position: new THREE.Vector3(0, 0, 0), speed: 0, heading: 0 });

  it('heat transitions', () => {
    const p = new PoliceSystem(null, null);
    expect(p.heat).toBe(0);
    const pl = fakePlayer();
    p.update(0.1, pl);
    p.triggerPursuit(pl);
    expect(p.heat).toBe(1);
    expect(p.active).toBe(true);
    expect(p.units.length).toBe(2);
    p.addHeat(10);
    expect(p.heat).toBe(5);
    p.update(0.1, pl);
    expect(p.units.length).toBe(6);
  });

  it('busted when slow & surrounded for 3s', () => {
    const p = new PoliceSystem(null, null);
    const pl = fakePlayer();
    const busted = vi.fn();
    p.onBusted(busted);
    p.triggerPursuit(pl);
    let t = 0;
    while (!busted.mock.calls.length && t < 30) { p.update(1 / 30, pl); t += 1 / 30; }
    expect(busted).toHaveBeenCalledTimes(1);
    expect(t).toBeGreaterThan(3);
    expect(p.active).toBe(false);
    expect(p.heat).toBe(0);
  });

  it('not busted while player is fast', () => {
    const p = new PoliceSystem(null, null);
    const pl = fakePlayer(); pl.speed = 30;
    const busted = vi.fn(); p.onBusted(busted);
    p.triggerPursuit(pl);
    for (let i = 0; i < 300; i++) { pl.position.z -= 30 / 30; p.update(1 / 30, pl); }
    expect(busted).not.toHaveBeenCalled();
  });

  it('escapes after 10s out of range', () => {
    const p = new PoliceSystem(null, null);
    const pl = fakePlayer(); pl.speed = 100;
    const escaped = vi.fn(); p.onEscaped(escaped);
    p.triggerPursuit(pl);
    pl.position.set(5000, 0, 0);
    let t = 0;
    while (!escaped.mock.calls.length && t < 20) { pl.position.x += 10; p.update(1 / 30, pl); t += 1 / 30; }
    expect(escaped).toHaveBeenCalledTimes(1);
    expect(t).toBeGreaterThanOrEqual(9.9);
    expect(p.heat).toBe(0);
    expect(p.units.length).toBe(0);
  });

  it('builds light bars when a scene is given', () => {
    const scene = new THREE.Scene();
    const p = new PoliceSystem(scene, null);
    const pl = fakePlayer();
    p.triggerPursuit(pl);
    p.update(0.05, pl);
    expect(p.units[0].lightBar).toBeTruthy();
    expect(scene.children.length).toBe(2);
  });
});
