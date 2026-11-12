import { describe, it, expect } from 'vitest';
import { CARS, UPGRADES, applyUpgrades, getCar, CLASSES } from '../src/vehicles/catalog.js';
import { buildCarModel, updateCarModel, BODY_STYLES } from '../src/vehicles/carModel.js';
import * as THREE from 'three';

describe('catalog', () => {
  it('has >= 8 cars with unique ids and valid fields', () => {
    expect(CARS.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(CARS.map((c) => c.id));
    expect(ids.size).toBe(CARS.length);
    for (const c of CARS) {
      expect(CLASSES).toContain(c.class);
      expect(c.price).toBeGreaterThan(0);
      expect(typeof c.name).toBe('string');
      expect(BODY_STYLES[c.bodyStyle]).toBeTruthy();
      for (const k of ['mass', 'power', 'maxSpeed', 'grip', 'wheelbase', 'drag']) expect(c.spec[k]).toBeGreaterThan(0);
      expect(c.spec.gears.length).toBeGreaterThan(3);
      c.spec.gears.forEach((g) => expect(g).toBeGreaterThan(0));
    }
    expect(getCar(CARS[0].id)).toBe(CARS[0]);
  });
  it('covers every class D..S', () => {
    for (const k of CLASSES) expect(CARS.some((c) => c.class === k)).toBe(true);
  });
  it('applyUpgrades increases power and is pure', () => {
    const base = CARS[0].spec;
    const snapshot = JSON.stringify(base);
    const up = applyUpgrades(base, { engine: 3, tires: 2, weight: 1, nitro: 1 });
    expect(up.power).toBeGreaterThan(base.power);
    expect(up.grip).toBeGreaterThan(base.grip);
    expect(up.mass).toBeLessThan(base.mass);
    expect(up.nitroPower).toBeGreaterThan(1);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(up).not.toBe(base);
    expect(up.gears).not.toBe(base.gears);
    expect(applyUpgrades(base, {}).power).toBe(base.power);
    for (const k of Object.keys(UPGRADES)) expect(UPGRADES[k].levels.length).toBeGreaterThan(0);
  });
});

describe('carModel', () => {
  it('builds every body style with wheels/lights and animates', () => {
    for (const c of CARS) {
      const g = buildCarModel(c, { name: 'high' });
      expect(g.userData.wheels.length).toBe(4);
      expect(g.userData.brakeLights.length).toBe(2);
      expect(g.userData.headLights.length).toBe(2);
      updateCarModel(g, { position: new THREE.Vector3(1, 0, 2), heading: 0.5, speed: 20, wheelSteer: 0.3, input: { brake: 1 } }, 1 / 60);
      expect(g.position.x).toBe(1);
      expect(g.userData.wheels[0].rotation.y).toBeCloseTo(0.3);
      expect(g.userData.brakeLights[0].emissiveIntensity).toBeGreaterThan(1);
    }
  });
  it('shares geometry between cars of same style', () => {
    const a = buildCarModel(CARS[0]); const b = buildCarModel(CARS[0]);
    expect(a.userData.body.children[0].geometry).toBe(b.userData.body.children[0].geometry);
  });
});
