import { describe, it, expect } from 'vitest';
import { Vector3, Scene, PerspectiveCamera } from 'three';
import { Track } from '../src/world/track.js';
import { TRACKS, getTrackDef } from '../src/world/tracks.js';
import { buildCity } from '../src/world/city.js';
import { setupEnvironment } from '../src/world/environment.js';
import { PhotoMode } from '../src/world/pathtracer.js';

const track = new Track(TRACKS[0]);

describe('TRACKS', () => {
  it('has at least 5 valid tracks with unique ids', () => {
    expect(TRACKS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
    for (const id of ['harbor-loop', 'downtown-grid', 'canyon-run', 'industrial-zone', 'skyline-sprint']) {
      expect(getTrackDef(id).id).toBe(id);
    }
    for (const d of TRACKS) {
      expect(['night', 'dusk', 'day', 'rain']).toContain(d.timeOfDay);
      expect(d.controlPoints.length).toBeGreaterThanOrEqual(6);
      expect(typeof d.name).toBe('string');
      expect(typeof d.district).toBe('string');
    }
  });

  it('all tracks construct as closed loops of 1.5-4 km with gentle elevation', () => {
    for (const d of TRACKS) {
      const t = new Track(d);
      expect(t.length).toBeGreaterThan(1500);
      expect(t.length).toBeLessThan(4000);
      const a = t.pointAt(0), b = t.pointAt(0.99999);
      expect(a.distanceTo(b)).toBeLessThan(1);
      // max grade < 10 %
      for (let u = 0; u < 1; u += 0.01) {
        const p = t.pointAt(u), q = t.pointAt(u + 0.002);
        const run = Math.hypot(q.x - p.x, q.z - p.z);
        expect(Math.abs(q.y - p.y) / run).toBeLessThan(0.1);
      }
      expect(t.checkpoints.length).toBeGreaterThan(2);
    }
  });
});

describe('Track queries', () => {
  it.each(TRACKS.map((d) => [d.id, d]))('progressAt is monotonic around the loop (%s)', (_id, def) => {
    const track = new Track(def);
    const N = 400;
    let prev = track.progressAt(track.pointAt(0));
    let wraps = 0;
    for (let i = 1; i <= N; i++) {
      const u = i / N;
      const p = track.progressAt(track.pointAt(u));
      let d = p - prev;
      if (d < -0.5) { d += 1; wraps++; }
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(0.02);
      prev = p;
    }
    expect(wraps).toBe(1);
  });

  it('progressAt recovers u for points on the line and offset laterally', () => {
    for (let u = 0.05; u < 1; u += 0.1) {
      const p = track.pointAt(u), t = track.tangentAt(u);
      const off = p.clone().add(new Vector3(-t.z, 0, t.x).normalize().multiplyScalar(3));
      expect(Math.abs(track.progressAt(p) - u)).toBeLessThan(0.003);
      expect(Math.abs(track.progressAt(off) - u)).toBeLessThan(0.005);
      expect(track.lateralAt(off)).toBeCloseTo(3, 0);
    }
  });

  it('pointAt / tangentAt are consistent', () => {
    for (let u = 0; u < 1; u += 0.05) {
      const t = track.tangentAt(u);
      expect(t.length()).toBeCloseTo(1, 5);
      const a = track.pointAt(u), b = track.pointAt(u + 0.001);
      const dir = b.sub(a).normalize();
      expect(dir.dot(t)).toBeGreaterThan(0.98);
    }
    expect(track.pointAt(1.25).distanceTo(track.pointAt(0.25))).toBeLessThan(1e-6);
  });

  it('heightAt is finite everywhere and matches the road', () => {
    for (let i = 0; i < 200; i++) {
      const h = track.heightAt((Math.random() - 0.5) * 6000, (Math.random() - 0.5) * 6000);
      expect(Number.isFinite(h)).toBe(true);
    }
    const p = track.pointAt(0.3);
    expect(track.heightAt(p.x, p.z)).toBeCloseTo(p.y, 5);
  });

  it('constrain pushes an off-road point back within the barriers', () => {
    for (let u = 0.03; u < 1; u += 0.13) {
      const c = track.pointAt(u), t = track.tangentAt(u);
      const n = new Vector3(-t.z, 0, t.x).normalize();
      for (const side of [-1, 1]) {
        const pos = c.clone().addScaledVector(n, side * (track.width / 2 + 8));
        const vel = n.clone().multiplyScalar(side * 20);
        const res = track.constrain(pos, vel);
        expect(res.hit).toBe(true);
        expect(Math.abs(track.lateralAt(pos))).toBeLessThanOrEqual(track.wallOffset + 0.05);
        expect(vel.dot(n) * side).toBeLessThanOrEqual(0); // no longer moving outward
        expect(res.normal.dot(n) * side).toBeLessThan(0); // normal points back to road
      }
      const inside = c.clone().addScaledVector(n, 1);
      const before = inside.clone();
      expect(track.constrain(inside, new Vector3()).hit).toBe(false);
      expect(inside.distanceTo(before)).toBe(0);
    }
  });

  it('startTransform slots are distinct, on-road and behind the line', () => {
    const seen = [];
    for (let s = 0; s < 8; s++) {
      const { position, heading } = track.startTransform(s);
      expect(Number.isFinite(heading)).toBe(true);
      expect(Math.abs(track.lateralAt(position))).toBeLessThan(track.width / 2);
      expect(track.progressAt(position)).toBeGreaterThan(0.9);
      for (const p of seen) expect(p.distanceTo(position)).toBeGreaterThan(2.5);
      seen.push(position);
      // heading convention: 0 = -Z, forward = (-sin h, 0, -cos h) aligns with the tangent
      const fwd = new Vector3(-Math.sin(heading), 0, -Math.cos(heading));
      const t = track.tangentAt(track.progressAt(position));
      expect(fwd.dot(t.setY(0).normalize())).toBeGreaterThan(0.95);
    }
  });
});

describe('city (node, no DOM)', () => {
  it('builds and updates for every track within a sane draw-call budget', () => {
    for (const d of TRACKS) {
      const scene = new Scene();
      const city = buildCity(scene, new Track(d), { name: 'medium', drawDistance: 800, shadows: true });
      let meshes = 0;
      scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) meshes++; });
      expect(meshes).toBeLessThan(150);
      city.update(1 / 60, new PerspectiveCamera());
      city.dispose();
      expect(scene.children.length).toBe(0);
    }
  });
});

describe('environment + photo mode (headless)', () => {
  it('sets up every time of day without a renderer', () => {
    for (const tod of ['night', 'dusk', 'day', 'rain']) {
      const scene = new Scene();
      const camera = new PerspectiveCamera();
      const env = setupEnvironment({ scene, camera, renderer: null, quality: { name: 'medium', shadows: true, drawDistance: 800 } }, tod);
      expect(scene.fog).toBeTruthy();
      env.update(1 / 60);
      env.dispose();
      expect(scene.children.length).toBe(0);
    }
  });
  it('PhotoMode is inactive by default and refuses on WebGPU', () => {
    const pm = new PhotoMode({ isWebGPU: true });
    expect(pm.active).toBe(false);
    expect(pm.toggle()).toBe(false);
    expect(pm.active).toBe(false);
  });
});
