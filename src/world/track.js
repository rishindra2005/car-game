// Track: closed CatmullRom spline + fast queries (node-safe, no DOM / WebGL needed).
import { CatmullRomCurve3, Vector3 } from 'three';

const CELL = 24; // spatial hash cell size (m)

/** Smooth, gentle elevation field. Same function is used for road, terrain and buildings. */
export function makeHeightField(amp = 4, seed = 1) {
  const p1 = seed * 1.37, p2 = seed * 2.11, p3 = seed * 0.73;
  const k1 = (2 * Math.PI) / 900, k2 = (2 * Math.PI) / 700, k3 = (2 * Math.PI) / 1300;
  return (x, z) =>
    amp * (0.5 * Math.sin(x * k1 + p1) + 0.35 * Math.cos(z * k2 + p2) + 0.25 * Math.sin((x + z) * k3 + p3));
}

export class Track {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.width = def.width ?? 14;
    this.halfWidth = this.width / 2;
    /** Max lateral offset of a body centre from the centreline before hitting the barrier. */
    this.wallOffset = this.halfWidth + 0.6;
    this.laps = def.laps ?? 3;
    this.timeOfDay = def.timeOfDay ?? 'night';
    this.heightField = makeHeightField(def.elevation ?? 4, def.seed ?? 1);

    const pts = def.controlPoints.map(([x, z]) => new Vector3(x, this.heightField(x, z), z));
    this.spline = new CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.length = this.spline.getLength();

    // Uniform arc-length samples (~2 m apart)
    const n = Math.max(64, Math.ceil(this.length / 2));
    this.sampleCount = n;
    this.samples = new Float32Array(n * 3); // x,y,z
    this.tangents = new Float32Array(n * 3); // horizontal unit tangent x,0,z
    const p = new Vector3(), t = new Vector3();
    for (let i = 0; i < n; i++) {
      const u = i / n;
      this.spline.getPointAt(u, p);
      this.spline.getTangentAt(u, t);
      this.samples[i * 3] = p.x;
      this.samples[i * 3 + 1] = this.heightField(p.x, p.z);
      this.samples[i * 3 + 2] = p.z;
      const l = Math.hypot(t.x, t.z) || 1;
      this.tangents[i * 3] = t.x / l;
      this.tangents[i * 3 + 2] = t.z / l;
    }

    // Spatial hash of sample indices
    this.grid = new Map();
    const reach = Math.ceil((this.wallOffset + 40) / CELL);
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(this.samples[i * 3] / CELL), cz = Math.floor(this.samples[i * 3 + 2] / CELL);
      for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
        const k = (cx + dx) * 73856 + (cz + dz);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        if (arr[arr.length - 1] !== i) arr.push(i);
      }
    }

    // bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = this.samples[i * 3], z = this.samples[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    this.bounds = { minX, maxX, minZ, maxZ };

    const cpCount = def.checkpointCount ?? 8;
    this.checkpoints = Array.from({ length: cpCount }, (_, i) => i / cpCount);

    this._near = { index: 0, u: 0, lateral: 0, dist: 0, cx: 0, cz: 0, tx: 0, tz: 1 };
    this._hit = { hit: false, normal: new Vector3(), lateral: 0 };
  }

  /** Elevation of the ground/road surface at (x,z). O(1). */
  heightAt(x, z) {
    return this.heightField(x, z);
  }

  /** Nearest projection onto centreline. Returns shared object {u, lateral, dist, cx, cz, tx, tz, index}. */
  nearest(x, z) {
    const n = this.sampleCount, s = this.samples;
    const cand = this.grid.get(Math.floor(x / CELL) * 73856 + Math.floor(z / CELL));
    let best = -1, bestD = Infinity;
    if (cand) {
      for (let j = 0; j < cand.length; j++) {
        const i = cand[j], dx = s[i * 3] - x, dz = s[i * 3 + 2] - z, d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let i = 0; i < n; i++) {
        const dx = s[i * 3] - x, dz = s[i * 3 + 2] - z, d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    // refine: project onto the segment before or after the nearest sample
    const segLen = this.length / n;
    let bestT = 0, bestSeg = best, bestPD = Infinity, px = 0, pz = 0;
    for (let k = -1; k <= 0; k++) {
      const a = (best + k + n) % n, b = (a + 1) % n;
      const ax = s[a * 3], az = s[a * 3 + 2], bx = s[b * 3], bz = s[b * 3 + 2];
      const ex = bx - ax, ez = bz - az, el = ex * ex + ez * ez || 1;
      let t = ((x - ax) * ex + (z - az) * ez) / el;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + ex * t, qz = az + ez * t, d = (qx - x) ** 2 + (qz - z) ** 2;
      if (d < bestPD) { bestPD = d; bestT = t; bestSeg = a; px = qx; pz = qz; }
    }
    const a = bestSeg, b = (a + 1) % n;
    let tx = s[b * 3] - s[a * 3], tz = s[b * 3 + 2] - s[a * 3 + 2];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    // right-hand normal (looking along tangent): (-tz, tx)
    const r = this._near;
    r.index = a;
    r.u = ((a + bestT) / n) % 1;
    r.cx = px; r.cz = pz; r.tx = tx; r.tz = tz;
    r.lateral = (x - px) * -tz + (z - pz) * tx;
    r.dist = Math.sqrt(bestPD);
    void segLen;
    return r;
  }

  /** Progress 0..1 along the loop for a world position. */
  progressAt(pos) {
    return this.nearest(pos.x, pos.z).u;
  }

  /** Signed lateral offset from centreline (+ = right of travel direction). */
  lateralAt(pos) {
    return this.nearest(pos.x, pos.z).lateral;
  }

  pointAt(u, target = new Vector3()) {
    u = ((u % 1) + 1) % 1;
    this.spline.getPointAt(u, target);
    target.y = this.heightField(target.x, target.z);
    return target;
  }

  tangentAt(u, target = new Vector3()) {
    u = ((u % 1) + 1) % 1;
    return this.spline.getTangentAt(u, target).normalize();
  }

  /** Heading (radians, 0 = -Z, positive = turning left/CCW seen from above) of the tangent at u. */
  headingAt(u) {
    const t = this.tangentAt(u, _tmp);
    return Math.atan2(-t.x, -t.z);
  }

  /**
   * Keep a body inside the barriers. Mutates pos (and vel: outward component removed, slight bounce).
   * Returns shared {hit, normal (points back toward the road), lateral}.
   */
  constrain(pos, vel, radius = 0) {
    const r = this.nearest(pos.x, pos.z);
    const hit = this._hit;
    const limit = this.wallOffset - radius;
    hit.lateral = r.lateral;
    if (Math.abs(r.lateral) <= limit) {
      hit.hit = false;
      hit.normal.set(0, 0, 0);
      return hit;
    }
    const side = Math.sign(r.lateral);
    const nx = -r.tz * side, nz = r.tx * side; // outward normal
    const push = Math.abs(r.lateral) - limit;
    pos.x -= nx * push;
    pos.z -= nz * push;
    hit.hit = true;
    hit.normal.set(-nx, 0, -nz);
    if (vel) {
      const vn = vel.x * nx + vel.z * nz;
      if (vn > 0) {
        vel.x -= nx * vn * 1.3;
        vel.z -= nz * vn * 1.3;
      }
    }
    return hit;
  }

  /** Grid slots behind the start line (u=0). Two columns, 8 m rows. */
  startTransform(slot = 0) {
    const row = Math.floor(slot / 2), col = slot % 2;
    const back = 12 + row * 8 + col * 3;
    const u = 1 - back / this.length;
    const p = this.pointAt(u, new Vector3());
    const t = this.tangentAt(u, new Vector3());
    const side = (col === 0 ? -1 : 1) * this.width * 0.22;
    p.x += -t.z * side; // right normal (-tz, tx)
    p.z += t.x * side;
    p.y = this.heightField(p.x, p.z);
    return { position: p, heading: Math.atan2(-t.x, -t.z), u };
  }
}

const _tmp = new Vector3();
