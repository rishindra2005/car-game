// Procedural night city around a Track. Node-safe at import time (no DOM use; textures are DataTextures).
// Draw-call budget: ~45 merged building chunks (distance + frustum culled) + ~15 static/instanced meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const WIN_M = 56; // meters covered by one repeat of the window texture (16 floors x 3.5 m)
const CHUNK = 400;

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
      const c = k < 0.6 ? [255, 196, 120] : k < 0.85 ? [190, 215, 255] : [255, 240, 210];
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
      let r = 52, g = 54, b = 60;
      if (inWin(x, y)) {
        if (lit[ci] > 0) { r = lit[ci] * 0.7; g = lit[ci + 1] * 0.7; b = lit[ci + 2] * 0.7; }
        else { r = 22; g = 28; b = 40; }
      } else if (y % cell === 0 || y % cell === 15) { r = 38; g = 40; b = 45; }
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

export function buildCity(scene, track, quality = {}) {
  const q = { name: 'medium', shadows: true, drawDistance: 900, ...quality };
  const tier = q.name === 'low' ? 0 : q.name === 'high' || q.name === 'ultra' ? 2 : 1;
  const H = (x, z) => track.heightAt(x, z);
  const rng = mulberry32((track.def?.seed ?? 1) * 9973 + 17);
  const tod = track.timeOfDay || track.def?.timeOfDay || 'night';
  const night = tod === 'night' || tod === 'rain';
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

  // ---------- road surface, markings, curbs, barriers, sidewalks ----------
  const road = new GeoBuilder(), marks = new GeoBuilder(), curbs = new GeoBuilder(), walk = new GeoBuilder();
  const roadEdge = hw + 1.4, barrierIn = hw + 1.4, barrierOut = hw + 1.9, walkOut = hw + 6.5;
  const lanes = Math.max(2, Math.round(track.width / 3.6));
  const white = [0.92, 0.92, 0.9], yellow = [1.0, 0.75, 0.15];
  for (let i = 0; i < n; i++) {
    const j = i + 1, v0 = (i * segLen) / 8, v1 = (j * segLen) / 8;
    road.quad(at(i, -roadEdge, 0.02), at(i, roadEdge, 0.02), at(j, roadEdge, 0.02), at(j, -roadEdge, 0.02), UP,
      [[0, v0], [1, v0], [1, v1], [0, v1]], [1, 1, 1]);
    const dist = i * segLen;
    // lane dividers (dashed), centre line double-ish yellow, solid edge lines
    for (let l = 1; l < lanes; l++) {
      const lat = -hw + (track.width * l) / lanes;
      const centre = l * 2 === lanes;
      if (centre || dist % 9 < 4) {
        const w = centre ? 0.12 : 0.1;
        marks.quad(at(i, lat - w, 0.035), at(i, lat + w, 0.035), at(j, lat + w, 0.035), at(j, lat - w, 0.035), UP, null, centre ? yellow : white);
      }
    }
    for (const s of [-1, 1]) {
      const lat = s * (hw - 0.35);
      marks.quad(at(i, lat - 0.1, 0.035), at(i, lat + 0.1, 0.035), at(j, lat + 0.1, 0.035), at(j, lat - 0.1, 0.035), UP, null, white);
      // curb (raised rumble strip) at road edge, alternating red/white
      const col = Math.floor(dist / 2) % 2 ? [0.75, 0.08, 0.06] : [0.85, 0.85, 0.85];
      const a = s * hw, b = s * (hw + 0.6);
      curbs.quad(at(i, a, 0.07), at(i, b, 0.07), at(j, b, 0.07), at(j, a, 0.07), UP, null, col);
      // jersey barrier
      const bi = s * barrierIn, bo = s * barrierOut;
      const nx = -T[i * 3 + 2] * s, nz = T[i * 3] * s; // outward
      const grey = [0.55, 0.56, 0.58], stripe = Math.floor(dist / 3) % 2 ? [0.9, 0.7, 0.1] : [0.08, 0.08, 0.08];
      curbs.quad(at(i, bi, 0), at(j, bi, 0), at(j, bi, 0.55), at(i, bi, 0.55), [-nx, 0, -nz], null, grey);
      curbs.quad(at(i, bi, 0.55), at(j, bi, 0.55), at(j, bi, 0.85), at(i, bi, 0.85), [-nx, 0, -nz], null, stripe);
      curbs.quad(at(i, bi, 0.85), at(j, bi, 0.85), at(j, bo, 0.85), at(i, bo, 0.85), UP, null, [0.45, 0.45, 0.47]);
      curbs.quad(at(i, bo, 0), at(j, bo, 0), at(j, bo, 0.85), at(i, bo, 0.85), [nx, 0, nz], null, grey);
      // sidewalk
      walk.quad(at(i, bo, 0.15), at(i, s * walkOut, 0.15), at(j, s * walkOut, 0.15), at(j, bo, 0.15), UP,
        [[0, v0], [1, v0], [1, v1], [0, v1]], [1, 1, 1]);
      walk.quad(at(i, s * walkOut, -0.3), at(j, s * walkOut, -0.3), at(j, s * walkOut, 0.15), at(i, s * walkOut, 0.15), [nx, 0, nz], null, [0.7, 0.7, 0.7]);
    }
  }
  // checkered start line
  for (let k = 0; k < 16; k++) {
    for (let r = 0; r < 2; r++) {
      const la = -hw + (track.width * k) / 16, lb = la + track.width / 16;
      const black = (k + r) % 2 === 0;
      const i0 = r, i1 = r + 1;
      marks.quad(at(i0, la, 0.04), at(i0, lb, 0.04), at(i1, lb, 0.04), at(i1, la, 0.04), UP, null, black ? [0.03, 0.03, 0.03] : white);
    }
  }

  const asphalt = own(asphaltTexture(rng));
  asphalt.repeat.set(2, 1);
  const roadMat = own(new THREE.MeshStandardMaterial({ color: 0x3a3c42, map: asphalt, roughness: 0.82, metalness: 0.0, vertexColors: true }));
  roadMat.userData.wetable = true;
  const markMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x222222, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  markMat.userData.wetable = true;
  const curbMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  const walkMat = own(new THREE.MeshStandardMaterial({ color: 0x6a6c70, map: asphalt, roughness: 0.9, vertexColors: true }));
  walkMat.userData.wetable = true;
  const addMesh = (geo, mat, name, cast = false) => {
    const m = new THREE.Mesh(own(geo), mat);
    m.name = name; m.receiveShadow = true; m.castShadow = cast && q.shadows; m.matrixAutoUpdate = false;
    group.add(m);
    return m;
  };
  addMesh(road.build(), roadMat, 'road');
  addMesh(marks.build(), markMat, 'lane-markings');
  addMesh(curbs.build(), curbMat, 'curbs-barriers', true);
  addMesh(walk.build(), walkMat, 'sidewalks');

  // ---------- terrain ----------
  const b = track.bounds, margin = Math.min(1600, q.drawDistance * 0.8 + 300);
  const gx0 = b.minX - margin, gz0 = b.minZ - margin, gw = b.maxX - b.minX + margin * 2, gd = b.maxZ - b.minZ + margin * 2;
  const segs = tier === 0 ? 60 : 110;
  const terrainGeo = new THREE.PlaneGeometry(gw, gd, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  const tp = terrainGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i) + gx0 + gw / 2, z = tp.getZ(i) + gz0 + gd / 2;
    tp.setXYZ(i, x, H(x, z) - 0.1, z);
  }
  terrainGeo.computeVertexNormals();
  terrainGeo.attributes.uv.array.forEach((v, k, a) => (a[k] = v * (k % 2 ? gd : gw) / 6));
  const groundMat = own(new THREE.MeshStandardMaterial({ color: 0x23252a, map: asphalt, roughness: 0.95 }));
  groundMat.userData.wetable = true;
  addMesh(terrainGeo, groundMat, 'ground');

  // ---------- buildings (merged per 400 m chunk; one draw call per chunk) ----------
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
  const signs = [];
  const minClear = walkOut + 1.5;
  const addBuilding = (cx, cz, tx, tz, ha, hb, h, tint, facing) => {
    const near = track.nearest(cx, cz);
    if (near.dist - Math.hypot(ha, hb) < minClear) return false;
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
      [[0.001, 0.001], [0.002, 0.001], [0.002, 0.002], [0.001, 0.002]], [tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5]);
    if (facing && rng() < 0.4) {
      // neon sign on the road-facing wall
      const fx = facing[0], fz = facing[1];
      const sy = H(cx, cz) + 5 + rng() * Math.min(18, h * 0.5);
      signs.push({ x: cx + fx * (hb + 0.15), y: sy, z: cz + fz * (hb + 0.15), rot: Math.atan2(fx, fz), w: 4 + rng() * 6, h: 1.2 + rng() * 2 });
    }
    return true;
  };
  const tints = [[1, 1, 1], [0.85, 0.9, 1.05], [1.05, 0.95, 0.85], [0.8, 0.82, 0.86], [0.95, 1, 0.95]];
  // track-side row
  const tall = tod === 'day' ? 0.7 : 1;
  for (const side of [-1, 1]) {
    let d = rng() * 10;
    while (d < track.length) {
      const i = Math.floor(d / segLen) % n;
      const tx = T[i * 3], tz = T[i * 3 + 2];
      const ha = 6 + rng() * 9, hb = 6 + rng() * 10;
      const lat = side * (walkOut + 2.5 + hb + rng() * 4);
      const cx = S[i * 3] - tz * lat, cz = S[i * 3 + 2] + tx * lat;
      const h = (10 + Math.pow(rng(), 2) * 80) * tall;
      // facing direction towards the road = -side * right normal
      const fx = tz * side, fz = -tx * side;
      addBuilding(cx, cz, tx, tz, ha, hb, h, tints[Math.floor(rng() * tints.length)], [fx, fz]);
      d += ha * 2 + 2 + rng() * 6;
    }
  }
  // background blocks
  const maxBg = [250, 650, 1300][tier];
  let bg = 0;
  const pitch = 46;
  for (let x = gx0 + 60; x < gx0 + gw - 60 && bg < maxBg * 3; x += pitch) {
    for (let z = gz0 + 60; z < gz0 + gd - 60; z += pitch) {
      if (rng() < 0.2) continue;
      bg++;
      const ha = 8 + rng() * 10, hb = 8 + rng() * 10;
      const distC = Math.hypot(x - (b.minX + b.maxX) / 2, z - (b.minZ + b.maxZ) / 2);
      const downtown = Math.max(0.25, 1 - distC / 1500);
      const h = (12 + Math.pow(rng(), 1.6) * 110 * downtown) * tall;
      addBuilding(x + (rng() - 0.5) * 8, z + (rng() - 0.5) * 8, 1, 0, ha, hb, h, tints[Math.floor(rng() * tints.length)], null);
    }
  }
  const wtex = windowTextures(rng, night ? 0.42 : 0.15);
  own(wtex.map); own(wtex.emissive);
  const buildingMat = own(new THREE.MeshStandardMaterial({
    map: wtex.map, emissiveMap: wtex.emissive, emissive: 0xffffff, emissiveIntensity: night ? 1.6 : tod === 'dusk' ? 0.9 : 0.05,
    roughness: 0.55, metalness: 0.25, vertexColors: true,
  }));
  const chunkMeshes = [];
  for (const c of chunks.values()) {
    if (c.geo.empty) continue;
    const m = addMesh(c.geo.build(), buildingMat, 'buildings', true);
    m.userData.center = new THREE.Vector3(c.cx, 0, c.cz);
    chunkMeshes.push(m);
  }

  // ---------- neon signs (instanced) ----------
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();
  const neon = [0xff2a6d, 0x05d9e8, 0xd1f7ff, 0xff9f1c, 0x7b2cff, 0x39ff14];
  if (signs.length) {
    const signMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2), toneMapped: true }));
    const sm = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1)), signMat, signs.length);
    signs.forEach((s, k) => {
      tmpQ.setFromEuler(tmpE.set(0, s.rot, 0));
      tmpM.compose(tmpP.set(s.x, s.y, s.z), tmpQ, tmpS.set(s.w, s.h, 1));
      sm.setMatrixAt(k, tmpM);
      sm.setColorAt(k, tmpC.setHex(neon[Math.floor(rng() * neon.length)]));
    });
    sm.name = 'neon-signs';
    sm.computeBoundingSphere();
    group.add(sm);
  }

  // ---------- street lamps, light pools, trees ----------
  const lampSpacing = 34;
  const lamps = [];
  for (let d = 5, k = 0; d < track.length; d += lampSpacing, k++) {
    const i = Math.floor(d / segLen) % n, side = k % 2 ? 1 : -1;
    const tx = T[i * 3], tz = T[i * 3 + 2];
    const base = at(i, side * (barrierOut + 0.6));
    const head = at(i, side * (hw - 1.5));
    lamps.push({ x: base[0], y: base[1], z: base[2], hx: head[0], hz: head[2], hy: base[1] + 8.6, rot: Math.atan2(-tz * side, tx * side) });
  }
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 9, 6).translate(0, 4.5, 0);
  const armLen = hw + 2.0 + 1.5 - 0.6 + 0.4;
  const armGeo = new THREE.BoxGeometry(armLen, 0.12, 0.12).translate(-armLen / 2, 8.8, 0);
  const lampGeo = own(mergeGeometries([poleGeo, armGeo]));
  poleGeo.dispose(); armGeo.dispose();
  const headGeo = own(new THREE.BoxGeometry(1.0, 0.18, 0.45));
  const poleMat = own(new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.5, metalness: 0.7 }));
  const headMat = own(new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: night ? 6 : tod === 'dusk' ? 3 : 0.3 }));
  const poles = new THREE.InstancedMesh(lampGeo, poleMat, lamps.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
  const pools = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    own(new THREE.MeshBasicMaterial({ map: own(radialTexture()), color: new THREE.Color(1.0, 0.72, 0.42).multiplyScalar(night ? 0.55 : 0.15),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
    lamps.length);
  lamps.forEach((l, k) => {
    // arm points along local -X, so rotate so -X points to the road
    tmpQ.setFromEuler(tmpE.set(0, l.rot + Math.PI, 0));
    tmpM.compose(tmpP.set(l.x, l.y, l.z), tmpQ, tmpS.set(1, 1, 1));
    poles.setMatrixAt(k, tmpM);
    tmpM.compose(tmpP.set(l.hx, l.hy, l.hz), tmpQ, tmpS.set(1, 1, 1));
    heads.setMatrixAt(k, tmpM);
    tmpM.compose(tmpP.set(l.hx, H(l.hx, l.hz) + 0.06, l.hz), tmpQ, tmpS.set(20, 1, 20));
    pools.setMatrixAt(k, tmpM);
  });
  poles.castShadow = q.shadows; poles.name = 'lamp-poles';
  heads.name = 'lamp-heads'; pools.name = 'lamp-pools';
  pools.renderOrder = 1;
  for (const m of [poles, heads, pools]) { m.computeBoundingSphere(); group.add(m); }
  if (!night && tod !== 'dusk') pools.visible = false;

  // trees on the sidewalk between lamps
  const trees = [];
  for (let d = 22; d < track.length; d += tier === 0 ? 40 : 24) {
    if (rng() < 0.3) continue;
    const i = Math.floor(d / segLen) % n, side = rng() < 0.5 ? -1 : 1;
    const p = at(i, side * (walkOut - 1.6), 0.15);
    trees.push({ x: p[0], y: p[1], z: p[2], s: 0.8 + rng() * 0.6 });
  }
  if (trees.length) {
    const trunk = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.15, 0.22, 3, 5).translate(0, 1.5, 0)),
      own(new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.9 })), trees.length);
    const crown = new THREE.InstancedMesh(own(new THREE.IcosahedronGeometry(1.8, 1).translate(0, 4.2, 0)),
      own(new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 0.85, flatShading: true })), trees.length);
    trees.forEach((t, k) => {
      tmpQ.setFromEuler(tmpE.set(0, rng() * 6.28, 0));
      tmpM.compose(tmpP.set(t.x, t.y, t.z), tmpQ, tmpS.set(t.s, t.s, t.s));
      trunk.setMatrixAt(k, tmpM); crown.setMatrixAt(k, tmpM);
      crown.setColorAt(k, tmpC.setHSL(0.27 + rng() * 0.08, 0.45, 0.35 + rng() * 0.15));
    });
    trunk.castShadow = crown.castShadow = q.shadows;
    trunk.name = 'tree-trunks'; crown.name = 'tree-crowns';
    for (const m of [trunk, crown]) { m.computeBoundingSphere(); group.add(m); }
  }

  // ---------- a few real point lights that follow the camera to the nearest lamps ----------
  const lightCount = night || tod === 'dusk' ? [0, 3, 6][tier] : 0;
  const pLights = [];
  for (let k = 0; k < lightCount; k++) {
    const L = new THREE.PointLight(0xffc98a, night ? 60 : 25, 32, 2);
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
