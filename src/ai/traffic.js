// Civilian traffic: InstancedMesh per body style, kinematic lane following in both directions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { integrateBatch as wasmIntegrateBatch } from '../physics/wasm.js';

export const STRIDE = 6; // [x, z, heading, speed, targetSpeed, steer]
const STYLES = ['hatch', 'coupe', 'suv', 'muscle'];
const PALETTE = [0xd8d8d8, 0x2a2a2e, 0x8a1c1c, 0x1d3f7a, 0xc9b27c, 0x4d6b4d, 0xe0e0e0, 0x6e6e74, 0x3a2a5a, 0xb05a20];
const DIMS = { hatch: [1.7, 3.9, 0.75, 0.55], coupe: [1.8, 4.4, 0.65, 0.5], suv: [1.95, 4.7, 0.95, 0.65], muscle: [1.9, 4.8, 0.7, 0.5] };

/** JS reference integrator (same semantics expected from physics/wasm.js). */
export function integrateBatchJS(s, count, dt) {
  for (let i = 0; i < count; i++) {
    const o = i * STRIDE;
    const sp = s[o + 3], ts = s[o + 4];
    const acc = ts > sp ? 3 : -6;
    let ns = sp + acc * dt;
    if ((acc > 0 && ns > ts) || (acc < 0 && ns < ts)) ns = ts;
    s[o + 3] = ns;
    s[o + 2] += s[o + 5] * dt;
    s[o] += -Math.sin(s[o + 2]) * ns * dt;
    s[o + 1] += -Math.cos(s[o + 2]) * ns * dt;
  }
}

function setColor(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Low-poly civilian car geometry with vertex colors (white body tinted by instanceColor). */
export function buildTrafficGeometry(style) {
  const [w, l, h, cab] = DIMS[style] || DIMS.coupe;
  const parts = [];
  const body = new THREE.BoxGeometry(w, h, l); body.translate(0, 0.25 + h / 2, 0);
  parts.push(setColor(body, 0xffffff));
  const cabin = new THREE.BoxGeometry(w * 0.84, cab, l * (style === 'hatch' || style === 'suv' ? 0.55 : 0.45));
  cabin.translate(0, 0.25 + h + cab / 2, style === 'hatch' || style === 'suv' ? l * 0.12 : l * 0.05);
  parts.push(setColor(cabin, 0x1a2230));
  const wheel = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 8); wheel.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const g = wheel.clone(); g.translate(x * (w / 2 - 0.1), 0.33, z * l * 0.32);
    parts.push(setColor(g, 0x111111));
  }
  for (const x of [-1, 1]) {
    const hl = new THREE.BoxGeometry(w * 0.2, 0.1, 0.05); hl.translate(x * w * 0.32, 0.25 + h * 0.7, -l / 2 - 0.02);
    parts.push(setColor(hl, 0xfff6c0));
    const tl = new THREE.BoxGeometry(w * 0.22, 0.1, 0.05); tl.translate(x * w * 0.32, 0.25 + h * 0.75, l / 2 + 0.02);
    parts.push(setColor(tl, 0xff2020));
  }
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()), false);
  parts.forEach((p) => p.dispose());
  wheel.dispose();
  merged.computeVertexNormals();
  return merged;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class TrafficSystem {
  /**
   * @param {THREE.Scene|null} scene
   * @param {Track} track
   * @param {number} count
   * @param {object} quality uses drawDistance
   * @param {{integrate?:Function}} [opts]
   */
  constructor(scene, track, count = 20, quality = {}, opts = {}) {
    this.scene = scene;
    this.track = track;
    this.count = count;
    this.drawDistance = Math.min((quality && quality.drawDistance) || 400, 600);
    this.integrate = opts.integrate || (typeof wasmIntegrateBatch === 'function' ? wasmIntegrateBatch : integrateBatchJS);
    this.length = track.spline && track.spline.getLength ? track.spline.getLength() : 2000;
    const w = track.width || 12;
    // lanes: offset (m, + = right of tangent), dir (+1 forward along spline, -1 opposite)
    this.lanes = [
      { offset: w * 0.125, dir: 1 }, { offset: w * 0.375, dir: 1 },
      { offset: -w * 0.125, dir: -1 }, { offset: -w * 0.375, dir: -1 },
    ];
    this.state = new Float32Array(count * STRIDE);
    this.cars = [];
    this.meshes = [];
    const perStyle = STYLES.map(() => 0);
    for (let i = 0; i < count; i++) {
      const styleIndex = i % STYLES.length;
      this.cars.push({
        index: i, styleIndex, slot: perStyle[styleIndex]++,
        position: new THREE.Vector3(), velocity: new THREE.Vector3(), heading: 0, speed: 0,
        radius: 2.2, mass: 1300, u: 0, lane: this.lanes[i % this.lanes.length], cruise: 10,
        color: new THREE.Color(PALETTE[(i * 7) % PALETTE.length]),
      });
    }
    // InstancedMesh per body style
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.45 });
    STYLES.forEach((style, si) => {
      const n = perStyle[si];
      if (!n) { this.meshes.push(null); return; }
      const im = new THREE.InstancedMesh(buildTrafficGeometry(style), this.material, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true;
      im.frustumCulled = false;
      im.name = 'traffic:' + style;
      this.meshes.push(im);
      if (scene) scene.add(im);
    });
    for (const c of this.cars) {
      const im = this.meshes[c.styleIndex];
      im.setColorAt(c.slot, c.color);
    }
    this.meshes.forEach((m) => m && m.instanceColor && (m.instanceColor.needsUpdate = true));
    this._initialized = false;
  }

  /** World position of lane point at u. */
  lanePoint(u, lane, out = new THREE.Vector3()) {
    u = ((u % 1) + 1) % 1;
    out.copy(this.track.pointAt(u));
    _t.copy(this.track.tangentAt(u)); _t.y = 0; _t.normalize();
    out.x += -_t.z * lane.offset;
    out.z += _t.x * lane.offset;
    return out;
  }

  laneHeading(u, lane) {
    _t.copy(this.track.tangentAt(((u % 1) + 1) % 1));
    const h = Math.atan2(-_t.x, -_t.z);
    return lane.dir > 0 ? h : h + Math.PI;
  }

  _place(c, u) {
    c.u = ((u % 1) + 1) % 1;
    this.lanePoint(c.u, c.lane, c.position);
    c.heading = this.laneHeading(c.u, c.lane);
    const o = c.index * STRIDE;
    this.state[o] = c.position.x; this.state[o + 1] = c.position.z;
    this.state[o + 2] = c.heading; this.state[o + 5] = 0;
  }

  _respawn(c, playerU) {
    const span = this.drawDistance / this.length;
    const minGap = 50 / this.length;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const d = minGap + Math.random() * Math.max(0, span * 0.9 - minGap);
    c.cruise = 9 + Math.random() * 8;
    c.speed = c.cruise;
    this.state[c.index * STRIDE + 3] = c.speed;
    this._place(c, playerU + sign * d);
  }

  /** @param {number} dt @param {THREE.Vector3} playerPos */
  update(dt, playerPos) {
    const playerU = playerPos ? this.track.progressAt(playerPos) : 0;
    if (!this._initialized) {
      this._initialized = true;
      const span = Math.min(0.5, this.drawDistance / this.length);
      this.cars.forEach((c, i) => {
        c.cruise = 9 + Math.random() * 8; c.speed = c.cruise;
        this.state[c.index * STRIDE + 3] = c.speed;
        this._place(c, playerU + ((i / this.count) * 2 - 1) * span + 30 / this.length * (i % 2 ? 1 : -1));
      });
    }
    const s = this.state;
    // brake for car ahead in same lane (simple follow distance) and for player
    for (const c of this.cars) {
      let ts = c.cruise;
      for (const o of this.cars) {
        if (o === c || o.lane !== c.lane) continue;
        const du = ((((o.u - c.u) * c.lane.dir) % 1) + 1) % 1;
        const dm = du * this.length;
        if (dm < 14) ts = Math.min(ts, Math.max(0, (dm - 6) * 0.8));
      }
      if (playerPos) {
        const dx = playerPos.x - c.position.x, dz = playerPos.z - c.position.z;
        const ahead = dx * -Math.sin(c.heading) + dz * -Math.cos(c.heading);
        const side = Math.abs(dx * Math.cos(c.heading) - dz * Math.sin(c.heading));
        if (ahead > 0 && ahead < 12 && side < 2) ts = Math.min(ts, 0);
      }
      s[c.index * STRIDE + 4] = ts;
      s[c.index * STRIDE + 5] = 0;
    }
    this.integrate(s, this.count, dt);
    const maxD2 = this.drawDistance * this.drawDistance;
    for (const c of this.cars) {
      const o = c.index * STRIDE;
      const dx = s[o] - c.position.x, dz = s[o + 1] - c.position.z;
      const moved = Math.sqrt(dx * dx + dz * dz);
      c.speed = s[o + 3];
      // project movement back onto the lane (keeps cars on the road regardless of integrator steering)
      this._place(c, c.u + (c.lane.dir * moved) / this.length);
      c.velocity.set(-Math.sin(c.heading) * c.speed, 0, -Math.cos(c.heading) * c.speed);
      if (this.track.heightAt) c.position.y = this.track.heightAt(c.position.x, c.position.z) || 0;
      if (playerPos) {
        const px = c.position.x - playerPos.x, pz = c.position.z - playerPos.z;
        if (px * px + pz * pz > maxD2) this._respawn(c, playerU);
      }
      const im = this.meshes[c.styleIndex];
      if (im) {
        _q.setFromAxisAngle(_up, c.heading);
        _m.compose(c.position, _q, _s);
        im.setMatrixAt(c.slot, _m);
      }
    }
    for (const im of this.meshes) if (im) im.instanceMatrix.needsUpdate = true;
  }

  /** Positions for collision tests: array of {position, velocity, radius, mass, heading}. */
  getColliders() { return this.cars; }

  /** Apply a push to a traffic car after collision (e.g. from resolveCarCollision). */
  bump(car, impulseSpeed = 0) {
    car.speed = Math.max(0, car.speed - impulseSpeed);
    this.state[car.index * STRIDE + 3] = car.speed;
  }

  dispose() {
    for (const im of this.meshes) {
      if (!im) continue;
      if (this.scene) this.scene.remove(im);
      im.geometry.dispose();
      im.dispose && im.dispose();
    }
    this.material.dispose();
  }
}
