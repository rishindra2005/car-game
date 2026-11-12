// Procedural open-world scenery (coastal city / countryside / canyon) around a Track. Node-safe at import time (no DOM use; textures are DataTextures).
// Draw-call budget: merged building chunks (distance + frustum culled) + ~16 static/instanced meshes. Stock materials only.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const WIN_M = 56; // meters covered by one repeat of the window texture (16 floors x 3.5 m)
const CHUNK = 500;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- procedural textures (DataTexture: works without a DOM) ----------
function dataTex(size, fill, srgb = true) {
  const data = new Uint8Array(size * size * 4);
  fill(data, size);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function windowTextures(rng, litChance) {
  const size = 256, cell = 16;
  const lit = new Float32Array(16 * 16 * 3);
  for (let i = 0; i < 256; i++) {
    const r = rng();
    if (r < litChance) {
      const k = rng();
      const c = k < 0.7 ? [255, 206, 140] : [255, 236, 200];
      const dim = 0.55 + rng() * 0.45;
      lit[i * 3] = c[0] * dim; lit[i * 3 + 1] = c[1] * dim; lit[i * 3 + 2] = c[2] * dim;
    }
  }
  const inWin = (x, y) => {
    const lx = x % cell, ly = y % cell;
    return lx >= 3 && lx <= 12 && ly >= 4 && ly <= 12;
  };
  const map = dataTex(size, (d) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4, ci = (Math.floor(y / cell) * 16 + Math.floor(x / cell)) * 3;
      let r = 222, g = 220, b = 214;
      if (inWin(x, y)) {
        r = 58; g = 76; b = 98;
        if (lit[ci] > 0) { r = 96; g = 100; b = 104; }
      } else if (y % cell === 0 || y % cell === 15) { r = 196; g = 194; b = 188; }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  });
  const emissive = dataTex(size, (d) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4, ci = (Math.floor(y / cell) * 16 + Math.floor(x / cell)) * 3;
      const on = inWin(x, y) && lit[ci] > 0;
      d[o] = on ? lit[ci] : 0; d[o + 1] = on ? lit[ci + 1] : 0; d[o + 2] = on ? lit[ci + 2] : 0; d[o + 3] = 255;
    }
  });
  return { map, emissive };
}

function asphaltTexture(rng) {
  return dataTex(128, (d, s) => {
    for (let i = 0; i < s * s; i++) {
      const v = 200 + rng() * 55 - (rng() < 0.02 ? 60 : 0);
      d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
  });
}

export function radialTexture() {
  return dataTex(64, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = (x + 0.5) / s - 0.5, dy = (y + 0.5) / s - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - r, 2.2) * 255;
      const o = (y * s + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = a; d[o + 3] = a;
    }
  }, false);
}

// ---------- geometry builder (non-indexed triangles with normals, uvs, colors) ----------
class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  // a,b,c,d: [x,y,z] corners in order; nrm: desired facing; uvs: 4x[u,v]; col: [r,g,b]
  quad(a, b, c, d, nrm, uvs, col) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    let order = [0, 1, 2, 0, 2, 3];
    if (fx * nrm[0] + fy * nrm[1] + fz * nrm[2] < 0) order = [0, 2, 1, 0, 3, 2];
    const v = [a, b, c, d];
    for (const i of order) {
      this.p.push(v[i][0], v[i][1], v[i][2]);
      this.n.push(nrm[0], nrm[1], nrm[2]);
      this.uv.push(uvs ? uvs[i][0] : 0, uvs ? uvs[i][1] : 0);
      this.c.push(col[0], col[1], col[2]);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.p.length === 0; }
}

const UP = [0, 1, 0];

const BIOMES = {
  city: { urban: 330, sideProb: 1, heightK: 1, trees: 450, hillStart: 430, hillRange: 700, hillAmp: 55, palms: 0, conifers: 0.15, lampGap: 34, sidewalk: true },
  coast: { urban: 170, sideProb: 0.6, heightK: 0.4, trees: 650, hillStart: 430, hillRange: 700, hillAmp: 60, palms: 0.55, conifers: 0.05, lampGap: 40, sidewalk: true, sea: true },
  canyon: { urban: 0, sideProb: 0.05, heightK: 0.12, trees: 2200, hillStart: 42, hillRange: 330, hillAmp: 95, palms: 0, conifers: 0.75, lampGap: 90, sidewalk: false },
  industrial: { urban: 230, sideProb: 0.75, heightK: 0.22, trees: 300, hillStart: 430, hillRange: 700, hillAmp: 45, palms: 0, conifers: 0.3, lampGap: 38, sidewalk: true },
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function tinted(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export function buildCity(scene, track, quality = {}) {
  const q = { name: 'medium', shadows: true, drawDistance: 900, ...quality };
  const tier = q.name === 'low' ? 0 : q.name === 'high' || q.name === 'ultra' ? 2 : 1;
  const H = (x, z) => track.heightAt(x, z);
  const seed = track.def?.seed ?? 1;
  const rng = mulberry32(seed * 9973 + 17);
  const tod = track.timeOfDay || track.def?.timeOfDay || 'day';
  const biomeName = track.def?.biome && BIOMES[track.def.biome] ? track.def.biome : 'city';
  const B = BIOMES[biomeName];
  const lit = tod === 'night' ? 1 : tod === 'dusk' ? 0.6 : 0; // artificial lighting amount
  const group = new THREE.Group();
  group.name = 'city';
  const disposables = [];
  const own = (x) => (disposables.push(x), x);

  const n = track.sampleCount, S = track.samples, T = track.tangents;
  const hw = track.halfWidth;
  const at = (i, lat, dy = 0) => {
    i = ((i % n) + n) % n;
    const x = S[i * 3] + -T[i * 3 + 2] * lat, z = S[i * 3 + 2] + T[i * 3] * lat;
    return [x, H(x, z) + dy, z];
  };
  const segLen = track.length / n;
  const b = track.bounds;
  let hMin = Infinity;
  for (let i = 0; i < n; i++) hMin = Math.min(hMin, S[i * 3 + 1]);
  const seaLevel = hMin - 3;

  // Scenery ground height = road field + distant rolling hills (+ shoreline dip on the -Z side for coast)
  const ground = (x, z) => {
    let h = H(x, z);
    const d = track.nearest(x, z).dist;
    const k = smooth(B.hillStart, B.hillStart + B.hillRange, d);
    const nz = 0.55 + 0.45 * Math.sin(x * 0.004 + seed) * Math.cos(z * 0.0035 + seed * 2) + 0.2 * Math.sin((x - z) * 0.011);
    let hill = B.hillAmp * k * Math.max(0.12, nz);
    if (B.sea) {
      const c = smooth(120, 520, b.minZ - z);
      hill *= 1 - c;
      h = h + (seaLevel - 18 - h) * c;
    }
    return h + hill;
  };

  // ---------- road surface, markings, curbs, guardrails, sidewalks/shoulders ----------
  const road = new GeoBuilder(), marks = new GeoBuilder(), curbs = new GeoBuilder(), rail = new GeoBuilder(), walk = new GeoBuilder();
  const railIn = hw + 1.4, railOut = hw + 1.55, walkIn = hw + 1.9, walkOut = hw + 6.5;
  const lanes = Math.max(2, Math.round(track.width / 3.6));
  const white = [0.9, 0.9, 0.88], yellow = [0.95, 0.72, 0.12];
  const steel = [0.62, 0.64, 0.66], steelDark = [0.42, 0.44, 0.46];
  const walkY = B.sidewalk ? 0.15 : 0.01;
  const walkCol = B.sidewalk ? [0.74, 0.73, 0.7] : [0.55, 0.47, 0.36];
  const cornerAt = (i) => {
    const j = (i + 8) % n;
    const cr = T[i * 3] * T[j * 3 + 2] - T[i * 3 + 2] * T[j * 3], dt = T[i * 3] * T[j * 3] + T[i * 3 + 2] * T[j * 3 + 2];
    return Math.abs(Math.atan2(cr, dt)) / (8 * segLen) > 1 / 130; // radius < 130 m
  };
  for (let i = 0; i < n; i++) {
    const j = i + 1, v0 = (i * segLen) / 8, v1 = (j * segLen) / 8;
    const shade = 0.94 + 0.06 * Math.sin(i * 0.37) * Math.sin(i * 0.051); // subtle patchiness
    road.quad(at(i, -walkIn, 0.02), at(i, walkIn, 0.02), at(j, walkIn, 0.02), at(j, -walkIn, 0.02), UP,
      [[0, v0], [1, v0], [1, v1], [0, v1]], [shade, shade, shade]);
    const dist = i * segLen;
    for (let l = 1; l < lanes; l++) {
      const lat = -hw + (track.width * l) / lanes;
      const centre = l * 2 === lanes;
      if (centre || dist % 9 < 4) {
        const w = centre ? 0.12 : 0.1;
        marks.quad(at(i, lat - w, 0.035), at(i, lat + w, 0.035), at(j, lat + w, 0.035), at(j, lat - w, 0.035), UP, null, centre ? yellow : white);
      }
    }
    const corner = cornerAt(i) || cornerAt((i - 6 + n) % n);
    for (const s of [-1, 1]) {
      const lat = s * (hw - 0.35);
      marks.quad(at(i, lat - 0.1, 0.035), at(i, lat + 0.1, 0.035), at(j, lat + 0.1, 0.035), at(j, lat - 0.1, 0.035), UP, null, white);
      if (corner) {
        const col = Math.floor(dist / 2) % 2 ? [0.72, 0.1, 0.08] : [0.88, 0.88, 0.86];
        const a = s * hw, c2 = s * (hw + 0.6);
        curbs.quad(at(i, a, 0.07), at(i, c2, 0.07), at(j, c2, 0.07), at(j, a, 0.07), UP, null, col);
      }
      // steel guardrail: W-beam + posts
      const bi = s * railIn, bo = s * railOut;
      const nx = -T[i * 3 + 2] * s, nz = T[i * 3] * s; // outward
      rail.quad(at(i, bi, 0.45), at(j, bi, 0.45), at(j, bi, 0.8), at(i, bi, 0.8), [-nx, 0, -nz], null, steel);
      rail.quad(at(i, bo, 0.45), at(j, bo, 0.45), at(j, bo, 0.8), at(i, bo, 0.8), [nx, 0, nz], null, steelDark);
      rail.quad(at(i, bi, 0.8), at(j, bi, 0.8), at(j, bo, 0.8), at(i, bo, 0.8), UP, null, steel);
      if (i % 2 === 0) {
        const p0 = at(i, s * (railOut + 0.02)), p1 = at(i, s * (railOut + 0.14));
        const tx = T[i * 3] * 0.06, tz = T[i * 3 + 2] * 0.06;
        const A = [p0[0] - tx, p0[1], p0[2] - tz], Bq = [p0[0] + tx, p0[1], p0[2] + tz], C = [p1[0] + tx, p1[1], p1[2] + tz], D = [p1[0] - tx, p1[1], p1[2] - tz];
        const up = (v) => [v[0], v[1] + 0.78, v[2]];
        rail.quad(A, Bq, up(Bq), up(A), [-nx, 0, -nz], null, steelDark);
        rail.quad(Bq, C, up(C), up(Bq), [T[i * 3], 0, T[i * 3 + 2]], null, steelDark);
        rail.quad(D, A, up(A), up(D), [-T[i * 3], 0, -T[i * 3 + 2]], null, steelDark);
        rail.quad(C, D, up(D), up(C), [nx, 0, nz], null, steelDark);
      }
      // sidewalk (urban) or dirt shoulder (canyon)
      walk.quad(at(i, s * walkIn, walkY), at(i, s * walkOut, walkY), at(j, s * walkOut, walkY), at(j, s * walkIn, walkY), UP,
        [[0, v0], [1, v0], [1, v1], [0, v1]], walkCol);
      if (B.sidewalk) {
        walk.quad(at(i, s * walkIn, 0), at(j, s * walkIn, 0), at(j, s * walkIn, walkY), at(i, s * walkIn, walkY), [-nx, 0, -nz], null, [0.6, 0.6, 0.58]);
        walk.quad(at(i, s * walkOut, -0.3), at(j, s * walkOut, -0.3), at(j, s * walkOut, walkY), at(i, s * walkOut, walkY), [nx, 0, nz], null, [0.6, 0.6, 0.58]);
      }
    }
  }
  // checkered start line
  for (let k = 0; k < 16; k++) {
    for (let r = 0; r < 2; r++) {
      const la = -hw + (track.width * k) / 16, lb = la + track.width / 16;
      marks.quad(at(r, la, 0.04), at(r, lb, 0.04), at(r + 1, lb, 0.04), at(r + 1, la, 0.04), UP, null, (k + r) % 2 === 0 ? [0.03, 0.03, 0.03] : white);
    }
  }

  const grain = own(asphaltTexture(rng));
  grain.repeat.set(2, 1);
  const roadMat = own(new THREE.MeshStandardMaterial({ color: 0x4b4c50, map: grain, roughness: 0.85, metalness: 0.0, vertexColors: true }));
  roadMat.userData.wetable = true;
  const markMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  markMat.userData.wetable = true;
  const curbMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  const railMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.75 }));
  const walkMat = own(new THREE.MeshStandardMaterial({ map: grain, roughness: 0.92, vertexColors: true }));
  walkMat.userData.wetable = true;
  const addMesh = (geo, mat, name, cast = false) => {
    const m = new THREE.Mesh(own(geo), mat);
    m.name = name; m.receiveShadow = true; m.castShadow = cast && q.shadows; m.matrixAutoUpdate = false;
    group.add(m);
    return m;
  };
  addMesh(road.build(), roadMat, 'road');
  addMesh(marks.build(), markMat, 'lane-markings');
  if (!curbs.empty) addMesh(curbs.build(), curbMat, 'curbs');
  addMesh(rail.build(), railMat, 'guardrails', true);
  addMesh(walk.build(), walkMat, 'sidewalks');

  // ---------- terrain: grass / rock / sand / paved city blocks, rolling hills in the distance ----------
  const margin = 1500;
  const gx0 = b.minX - margin, gz0 = b.minZ - margin, gw = b.maxX - b.minX + margin * 2, gd = b.maxZ - b.minZ + margin * 2;
  const segs = [90, 140, 170][tier];
  const terrainGeo = new THREE.PlaneGeometry(gw, gd, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  const tp = terrainGeo.attributes.position;
  const tcol = new Float32Array(tp.count * 3);
  const canyon = biomeName === 'canyon';
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i) + gx0 + gw / 2, z = tp.getZ(i) + gz0 + gd / 2;
    const g = ground(x, z), d = track._near.dist, base = H(x, z);
    tp.setXYZ(i, x, g - 0.12, z);
    // colour
    const n1 = 0.5 + 0.5 * Math.sin(x * 0.013 + seed) * Math.cos(z * 0.011 - seed), n2 = rng();
    let r = 0.27 + 0.13 * n1 + 0.04 * n2, gg = 0.42 + 0.1 * n1 + 0.05 * n2, bb = 0.16 + 0.05 * n1; // grass
    const dry = smooth(0.7, 1, 0.5 + 0.5 * Math.sin(x * 0.006 - z * 0.008 + seed * 3));
    r += (0.52 - r) * dry * 0.6; gg += (0.5 - gg) * dry * 0.6; bb += (0.28 - bb) * dry * 0.6;
    const rise = g - base;
    const rock = canyon ? Math.min(1, 0.25 + smooth(4, 40, rise) * (0.45 + 0.4 * n1)) : smooth(30, 70, rise) * 0.6;
    r += (0.5 + 0.08 * n2 - r) * rock; gg += (0.43 + 0.06 * n2 - gg) * rock; bb += (0.35 + 0.05 * n2 - bb) * rock;
    const urban = B.urban ? smooth(B.urban + 70, B.urban - 20, d) : 0; // paved lots between buildings
    r += (0.47 - r) * urban; gg += (0.47 - gg) * urban; bb += (0.45 - bb) * urban;
    if (B.sea) { const sand = smooth(seaLevel + 4, seaLevel + 0.5, g); r += (0.8 - r) * sand; gg += (0.72 - gg) * sand; bb += (0.54 - bb) * sand; }
    tcol[i * 3] = r; tcol[i * 3 + 1] = gg; tcol[i * 3 + 2] = bb;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  terrainGeo.computeVertexNormals();
  terrainGeo.attributes.uv.array.forEach((v, k, a) => (a[k] = (v * (k % 2 ? gd : gw)) / 6));
  const groundMat = own(new THREE.MeshStandardMaterial({ map: grain, roughness: 0.97, vertexColors: true }));
  addMesh(terrainGeo, groundMat, 'ground');

  // sea
  if (B.sea) {
    const sea = addMesh(new THREE.PlaneGeometry(gw + 6000, gd + 6000).rotateX(-Math.PI / 2).translate(gx0 + gw / 2, seaLevel, gz0 + gd / 2),
      own(new THREE.MeshStandardMaterial({ color: 0x1f5f7d, roughness: 0.16, metalness: 0.35 })), 'sea');
    sea.receiveShadow = false;
  }

  // distant low-poly mountain rings
  {
    const mg = new GeoBuilder();
    const mx = (b.minX + b.maxX) / 2, mz = (b.minZ + b.maxZ) / 2;
    const R0 = Math.max(gw, gd) / 2 - 150;
    for (let ring = 0; ring < 2; ring++) {
      const R = R0 + ring * 500, N = 56, amp = (canyon ? 420 : 240) * (1 + ring * 0.7);
      const hs = [];
      for (let k = 0; k < N; k++) {
        const a = (k / N) * Math.PI * 2;
        const seaSide = B.sea ? smooth(-0.1, -0.6, Math.sin(a)) : 0;
        hs.push((0.35 + 0.65 * rng()) * amp * (0.6 + 0.4 * Math.sin(a * 3 + seed + ring)) * (1 - seaSide * 0.92) + 15);
      }
      for (let k = 0; k < N; k++) {
        const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, h0 = hs[k], h1 = hs[(k + 1) % N];
        const P = (a, r, y) => [mx + Math.cos(a) * r, y, mz + Math.sin(a) * r];
        const am = (a0 + a1) / 2, sh = 0.85 + 0.3 * rng();
        const lo = ring ? [0.42 * sh, 0.5 * sh, 0.58 * sh] : [0.34 * sh, 0.43 * sh, 0.34 * sh];
        const hi = ring ? [0.55 * sh, 0.6 * sh, 0.68 * sh] : [0.5 * sh, 0.48 * sh, 0.44 * sh];
        const nIn = [-Math.cos(am) * 0.8, 0.6, -Math.sin(am) * 0.8];
        mg.quad(P(a0, R - 260, -30), P(a1, R - 260, -30), P(a1, R - 90, h1 * 0.5), P(a0, R - 90, h0 * 0.5), nIn, null, lo);
        mg.quad(P(a0, R - 90, h0 * 0.5), P(a1, R - 90, h1 * 0.5), P(a1, R, h1), P(a0, R, h0), nIn, null, hi);
      }
    }
    const m = addMesh(mg.build(), own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })), 'mountains');
    m.receiveShadow = false;
  }

  // ---------- buildings (merged per chunk; one draw call per chunk) ----------
  const occ = new Set();
  const occKey = (x, z) => Math.floor(x / 8) * 100003 + Math.floor(z / 8);
  const free = (cx, cz, r) => {
    for (let x = cx - r; x <= cx + r; x += 8) for (let z = cz - r; z <= cz + r; z += 8) if (occ.has(occKey(x, z))) return false;
    return true;
  };
  const mark = (cx, cz, r) => { for (let x = cx - r; x <= cx + r; x += 8) for (let z = cz - r; z <= cz + r; z += 8) occ.add(occKey(x, z)); };
  const chunks = new Map();
  const chunkOf = (x, z) => {
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = { geo: new GeoBuilder(), cx: (Math.floor(x / CHUNK) + 0.5) * CHUNK, cz: (Math.floor(z / CHUNK) + 0.5) * CHUNK }));
    return c;
  };
  const minClear = walkOut + 1.5;
  const addBuilding = (cx, cz, tx, tz, ha, hb, h, tint) => {
    const near = track.nearest(cx, cz);
    if (near.dist - Math.hypot(ha, hb) < minClear) return false;
    if (B.sea && cz < b.minZ - 100) return false;
    const r = Math.max(ha, hb);
    if (!free(cx, cz, r)) return false;
    mark(cx, cz, r);
    const nx = -tz, nz = tx;
    const y0 = H(cx, cz) - 4, y1 = y0 + 4 + h;
    const c = [
      [cx - tx * ha - nx * hb, cz - tz * ha - nz * hb], [cx + tx * ha - nx * hb, cz + tz * ha - nz * hb],
      [cx + tx * ha + nx * hb, cz + tz * ha + nz * hb], [cx - tx * ha + nx * hb, cz - tz * ha + nz * hb],
    ];
    const g = chunkOf(cx, cz).geo;
    const offU = Math.floor(rng() * 16) / 16, offV = Math.floor(rng() * 16) / 16 + 4 / WIN_M;
    for (let e = 0; e < 4; e++) {
      const p = c[e], qq = c[(e + 1) % 4];
      const mx = (p[0] + qq[0]) / 2 - cx, mz = (p[1] + qq[1]) / 2 - cz, ml = Math.hypot(mx, mz);
      const len = Math.hypot(qq[0] - p[0], qq[1] - p[1]) / WIN_M;
      const u0 = offU, u1 = offU + Math.round(len * 16) / 16, va = offV - 4 / WIN_M, vb = offV + h / WIN_M;
      g.quad([p[0], y0, p[1]], [qq[0], y0, qq[1]], [qq[0], y1, qq[1]], [p[0], y1, p[1]], [mx / ml, 0, mz / ml],
        [[u0, va], [u1, va], [u1, vb], [u0, vb]], tint);
    }
    g.quad([c[0][0], y1, c[0][1]], [c[1][0], y1, c[1][1]], [c[2][0], y1, c[2][1]], [c[3][0], y1, c[3][1]], UP,
      [[0.001, 0.001], [0.002, 0.001], [0.002, 0.002], [0.001, 0.002]], [0.42, 0.42, 0.42]);
    return true;
  };
  // natural facade palette: concrete, brick, sandstone, white stucco, blue-grey office glass, warm grey
  const tints = [[0.78, 0.77, 0.74], [0.66, 0.38, 0.3], [0.85, 0.74, 0.56], [0.93, 0.91, 0.87], [0.58, 0.68, 0.78], [0.7, 0.66, 0.6]];
  const lowTints = biomeName === 'industrial' ? [[0.7, 0.7, 0.68], [0.6, 0.36, 0.28], [0.55, 0.6, 0.62], [0.76, 0.72, 0.64]] : tints;
  const pick = (h) => { const p = h > 40 ? tints : lowTints; return h > 55 && rng() < 0.6 ? tints[4] : p[Math.floor(rng() * p.length)]; };
  for (const side of [-1, 1]) {
    let d = rng() * 10;
    while (d < track.length) {
      const i = Math.floor(d / segLen) % n;
      const tx = T[i * 3], tz = T[i * 3 + 2];
      const wide = biomeName === 'industrial' ? 1.5 : 1;
      const ha = (6 + rng() * 9) * wide, hb = (6 + rng() * 10) * wide;
      if (rng() < B.sideProb) {
        const lat = side * (walkOut + 2.5 + hb + rng() * 6);
        const cx = S[i * 3] - tz * lat, cz = S[i * 3 + 2] + tx * lat;
        const h = 7 + Math.pow(rng(), 2.2) * 75 * B.heightK;
        addBuilding(cx, cz, tx, tz, ha, hb, h, pick(h));
      }
      d += ha * 2 + 3 + rng() * (10 / Math.max(0.2, B.sideProb));
    }
  }
  if (B.urban) {
    const pitch = 48;
    const ccx = (b.minX + b.maxX) / 2, ccz = (b.minZ + b.maxZ) / 2;
    for (let x = b.minX - B.urban; x < b.maxX + B.urban; x += pitch) {
      for (let z = b.minZ - B.urban; z < b.maxZ + B.urban; z += pitch) {
        if (rng() < 0.25) continue;
        const px = x + (rng() - 0.5) * 10, pz = z + (rng() - 0.5) * 10;
        const dd = track.nearest(px, pz).dist;
        if (dd > B.urban || rng() < smooth(B.urban * 0.5, B.urban, dd) * 0.7) continue; // thin out toward the edge of town
        const downtown = Math.max(0.15, 1 - Math.hypot(px - ccx, pz - ccz) / 700);
        const ha = 8 + rng() * 9, hb = 8 + rng() * 9;
        const h = 7 + Math.pow(rng(), 1.8) * 120 * downtown * B.heightK;
        addBuilding(px, pz, 1, 0, ha, hb, h, pick(h));
      }
    }
  }
  const wtex = windowTextures(rng, lit ? 0.38 : 0.2);
  own(wtex.map); own(wtex.emissive);
  const buildingMat = own(new THREE.MeshStandardMaterial({
    map: wtex.map, emissiveMap: wtex.emissive, emissive: 0xffffff, emissiveIntensity: tod === 'night' ? 1.3 : tod === 'dusk' ? 0.7 : tod === 'rain' ? 0.12 : 0,
    roughness: 0.72, metalness: 0.08, vertexColors: true,
  }));
  const chunkMeshes = [];
  for (const c of chunks.values()) {
    if (c.geo.empty) continue;
    const m = addMesh(c.geo.build(), buildingMat, 'buildings', true);
    m.userData.center = new THREE.Vector3(c.cx, 0, c.cz);
    chunkMeshes.push(m);
  }

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();

  // ---------- street lamps (warm white, lit only at dusk/night) ----------
  const lamps = [];
  for (let d = 5, k = 0; d < track.length; d += B.lampGap, k++) {
    const i = Math.floor(d / segLen) % n, side = k % 2 ? 1 : -1;
    const tx = T[i * 3], tz = T[i * 3 + 2];
    const base = at(i, side * (walkIn + 0.6));
    const head = at(i, side * (hw - 1.5));
    lamps.push({ x: base[0], y: base[1], z: base[2], hx: head[0], hz: head[2], hy: base[1] + 8.6, rot: Math.atan2(-tz * side, tx * side) });
  }
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 9, 6).translate(0, 4.5, 0);
  const armLen = walkIn + 0.6 - (hw - 1.5) + 0.4;
  const armGeo = new THREE.BoxGeometry(armLen, 0.12, 0.12).translate(-armLen / 2, 8.8, 0);
  const lampGeo = own(mergeGeometries([poleGeo, armGeo]));
  poleGeo.dispose(); armGeo.dispose();
  const poleMat = own(new THREE.MeshStandardMaterial({ color: 0x6c7076, roughness: 0.5, metalness: 0.7 }));
  const headMat = own(new THREE.MeshStandardMaterial({ color: 0xd8d8d4, emissive: 0xffe2b8, emissiveIntensity: lit * 5 }));
  const poles = new THREE.InstancedMesh(lampGeo, poleMat, lamps.length);
  const heads = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1.0, 0.18, 0.45)), headMat, lamps.length);
  const pools = lit ? new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    own(new THREE.MeshBasicMaterial({ map: own(radialTexture()), color: new THREE.Color(1.0, 0.82, 0.6).multiplyScalar(0.4 * lit),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
    lamps.length) : null;
  lamps.forEach((l, k) => {
    tmpQ.setFromEuler(tmpE.set(0, l.rot + Math.PI, 0)); // arm (local -X) points to the road
    tmpM.compose(tmpP.set(l.x, l.y, l.z), tmpQ, tmpS.set(1, 1, 1));
    poles.setMatrixAt(k, tmpM);
    tmpM.compose(tmpP.set(l.hx, l.hy, l.hz), tmpQ, tmpS.set(1, 1, 1));
    heads.setMatrixAt(k, tmpM);
    if (pools) { tmpM.compose(tmpP.set(l.hx, H(l.hx, l.hz) + 0.06, l.hz), tmpQ, tmpS.set(20, 1, 20)); pools.setMatrixAt(k, tmpM); }
  });
  poles.castShadow = q.shadows; poles.name = 'lamp-poles'; heads.name = 'lamp-heads';
  if (pools) { pools.name = 'lamp-pools'; pools.renderOrder = 1; }
  for (const m of [poles, heads, pools]) if (m) { m.computeBoundingSphere(); group.add(m); }

  // ---------- vegetation: broadleaf, conifer, palm, bushes (one InstancedMesh per species) ----------
  const speciesGeo = {
    broadleaf: mergeGeometries([
      tinted(new THREE.CylinderGeometry(0.16, 0.26, 3.2, 5).translate(0, 1.6, 0), 0x5a4332),
      tinted(new THREE.IcosahedronGeometry(2.1, 1).scale(1, 0.85, 1).translate(0, 4.6, 0), 0x4f8a35),
      tinted(new THREE.IcosahedronGeometry(1.4, 0).translate(0.9, 5.6, 0.4), 0x5b9a3c),
    ]),
    conifer: mergeGeometries([
      tinted(new THREE.CylinderGeometry(0.14, 0.24, 2.4, 5).translate(0, 1.2, 0), 0x4e3a2a),
      tinted(new THREE.ConeGeometry(2.0, 4.2, 7).translate(0, 4.0, 0), 0x2f5d33),
      tinted(new THREE.ConeGeometry(1.5, 3.6, 7).translate(0, 6.4, 0), 0x356838),
      tinted(new THREE.ConeGeometry(0.9, 2.8, 7).translate(0, 8.5, 0), 0x3b733d),
    ]),
    palm: mergeGeometries([
      tinted(new THREE.CylinderGeometry(0.13, 0.22, 8, 6).translate(0, 4, 0), 0x8a7558),
      ...[0, 1, 2, 3, 4, 5, 6].map((k) => tinted(new THREE.ConeGeometry(0.55, 3.6, 4).scale(1, 1, 0.25).rotateZ(-Math.PI / 2 - 0.45).translate(1.6, 7.6, 0).rotateY((k / 7) * Math.PI * 2), 0x4c8f3a)),
    ]),
    bush: tinted(new THREE.IcosahedronGeometry(1, 0).scale(1.3, 0.75, 1.3).translate(0, 0.5, 0), 0x47803a),
  };
  const plants = { broadleaf: [], conifer: [], palm: [], bush: [] };
  const plant = (x, z, kind, s) => {
    const y = ground(x, z);
    if (track._near.dist < walkIn + 1.2 || (B.sea && y < seaLevel + 1.2)) return;
    if (occ.has(occKey(x, z))) return;
    plants[kind].push(x, y - 0.3, z, s);
  };
  const species = () => { const r = rng(); return r < B.palms ? 'palm' : r < B.palms + B.conifers ? 'conifer' : 'broadleaf'; };
  // street trees along the verge
  for (let d = 12; d < track.length; d += canyon ? 14 : 22) {
    if (rng() < 0.25) continue;
    const i = Math.floor(d / segLen) % n, side = rng() < 0.5 ? -1 : 1;
    const p = at(i, side * (walkOut - 1.4 + (canyon ? rng() * 6 : 0)));
    plant(p[0], p[2], B.palms > 0.3 && rng() < 0.8 ? 'palm' : species(), 0.8 + rng() * 0.5);
  }
  // scattered woodland, denser near the road so it reads from the driver's seat
  const treeN = Math.round(B.trees * [0.5, 1, 1.5][tier]);
  for (let k = 0; k < treeN * 1.6; k++) {
    const i = Math.floor(rng() * n), side = rng() < 0.5 ? -1 : 1;
    const lat = side * (walkOut + 2 + Math.pow(rng(), 1.7) * (canyon ? 380 : 520));
    const x = S[i * 3] - T[i * 3 + 2] * lat, z = S[i * 3 + 2] + T[i * 3] * lat;
    if (k % 4 === 3) plant(x, z, 'bush', 0.7 + rng() * 0.9);
    else plant(x, z, species(), 0.75 + rng() * 0.9);
  }
  const plantMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  for (const kind of Object.keys(plants)) {
    const arr = plants[kind], count = arr.length / 4;
    const geo = own(speciesGeo[kind]);
    if (!count) continue;
    const im = new THREE.InstancedMesh(geo, plantMat, count);
    for (let k = 0; k < count; k++) {
      const s = arr[k * 4 + 3];
      tmpQ.setFromEuler(tmpE.set(0, rng() * 6.28, 0));
      tmpM.compose(tmpP.set(arr[k * 4], arr[k * 4 + 1], arr[k * 4 + 2]), tmpQ, tmpS.set(s, s * (0.9 + rng() * 0.3), s));
      im.setMatrixAt(k, tmpM);
      const v = 0.8 + rng() * 0.35;
      im.setColorAt(k, tmpC.setRGB(v * (0.95 + rng() * 0.15), v, v * (0.85 + rng() * 0.15)));
    }
    im.castShadow = q.shadows && kind !== 'bush';
    im.receiveShadow = true;
    im.name = 'plants-' + kind;
    im.computeBoundingSphere();
    group.add(im);
  }

  // ---------- a few real point lights that follow the camera to the nearest lamps (dusk/night only) ----------
  const lightCount = lit ? [0, 3, 6][tier] : 0;
  const pLights = [];
  for (let k = 0; k < lightCount; k++) {
    const L = new THREE.PointLight(0xffe0b0, 55 * lit, 32, 2);
    L.castShadow = false;
    L.position.set(lamps[k % lamps.length].hx, lamps[k % lamps.length].hy - 0.3, lamps[k % lamps.length].hz);
    group.add(L);
    pLights.push(L);
  }
  const best = new Int32Array(lightCount), bestD = new Float64Array(lightCount);

  scene.add(group);
  group.updateMatrixWorld(true);

  let lightTimer = 0;
  const camPos = new THREE.Vector3();
  const drawDist = q.drawDistance;

  return {
    group,
    lamps,
    biome: biomeName,
    /** Scenery ground height (road field + hills/shore). Not for physics. */
    groundAt: ground,
    update(dt, camera) {
      if (!camera) return;
      camera.getWorldPosition(camPos);
      const lim = drawDist + CHUNK * 0.75;
      for (let k = 0; k < chunkMeshes.length; k++) {
        const c = chunkMeshes[k].userData.center;
        const dx = c.x - camPos.x, dz = c.z - camPos.z;
        chunkMeshes[k].visible = dx * dx + dz * dz < lim * lim;
      }
      lightTimer -= dt;
      if (lightCount && lightTimer <= 0) {
        lightTimer = 0.2;
        bestD.fill(Infinity); best.fill(-1);
        for (let k = 0; k < lamps.length; k++) {
          const dx = lamps[k].hx - camPos.x, dz = lamps[k].hz - camPos.z, d = dx * dx + dz * dz;
          if (d < bestD[lightCount - 1]) {
            let s = lightCount - 1;
            while (s > 0 && bestD[s - 1] > d) { bestD[s] = bestD[s - 1]; best[s] = best[s - 1]; s--; }
            bestD[s] = d; best[s] = k;
          }
        }
        for (let s = 0; s < lightCount; s++) {
          if (best[s] < 0) continue;
          const l = lamps[best[s]];
          pLights[s].position.set(l.hx, l.hy - 0.3, l.hz);
        }
      }
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose?.();
      group.traverse((o) => o.isInstancedMesh && o.dispose?.());
    },
  };
}
