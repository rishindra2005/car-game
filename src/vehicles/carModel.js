// Procedural, detailed car models. Geometries/materials are cached and shared.
// Cars face local -Z. Origin at ground level, centered.
import * as THREE from 'three';

// Dimensions per body style: L length, W width, H body (beltline) height, ride clearance, wheel radius,
// profile = side outline of lower body [x(front+), y]; cabin = greenhouse outline.
export const BODY_STYLES = {
  coupe: { L: 4.4, W: 1.86, wheelR: 0.33, wheelW: 0.24, track: 0.8, axle: [1.33, -1.32],
    profile: [[-2.2, 0.32], [-2.22, 0.62], [-2.05, 0.82], [-0.7, 0.9], [0.9, 0.86], [1.9, 0.72], [2.2, 0.55], [2.18, 0.3], [1.9, 0.22], [-1.95, 0.22]],
    cabin: [[-1.7, 0.86], [-0.85, 1.28], [0.2, 1.3], [1.05, 0.88]] },
  muscle: { L: 4.8, W: 1.95, wheelR: 0.35, wheelW: 0.28, track: 0.84, axle: [1.45, -1.45],
    profile: [[-2.4, 0.3], [-2.42, 0.75], [-2.3, 0.88], [-0.6, 0.95], [1.2, 0.95], [2.35, 0.86], [2.42, 0.6], [2.4, 0.3], [2.1, 0.22], [-2.15, 0.22]],
    cabin: [[-1.45, 0.92], [-0.75, 1.36], [0.35, 1.38], [0.95, 0.94]] },
  super: { L: 4.6, W: 2.0, wheelR: 0.35, wheelW: 0.3, track: 0.86, axle: [1.4, -1.4],
    profile: [[-2.3, 0.3], [-2.32, 0.66], [-2.15, 0.82], [-1.0, 0.86], [0.6, 0.7], [1.9, 0.5], [2.3, 0.36], [2.28, 0.2], [1.95, 0.15], [-2.0, 0.15]],
    cabin: [[-1.3, 0.84], [-0.4, 1.12], [0.25, 1.12], [1.2, 0.62]] },
  hatch: { L: 3.9, W: 1.76, wheelR: 0.3, wheelW: 0.21, track: 0.76, axle: [1.25, -1.2],
    profile: [[-1.95, 0.32], [-1.97, 0.88], [-1.85, 0.95], [0.6, 0.92], [1.6, 0.78], [1.95, 0.58], [1.95, 0.3], [1.7, 0.22], [-1.75, 0.22]],
    cabin: [[-1.88, 0.92], [-1.7, 1.42], [0.1, 1.45], [0.95, 0.9]] },
  suv: { L: 4.7, W: 1.98, wheelR: 0.38, wheelW: 0.27, track: 0.86, axle: [1.45, -1.4],
    profile: [[-2.32, 0.42], [-2.35, 1.05], [-2.25, 1.12], [1.0, 1.12], [2.1, 1.0], [2.35, 0.8], [2.33, 0.42], [2.0, 0.32], [-2.05, 0.32]],
    cabin: [[-2.2, 1.1], [-2.05, 1.72], [0.4, 1.75], [1.15, 1.1]] },
};

const _geoCache = new Map();
const _matCache = new Map();

function cached(map, key, make) {
  let v = map.get(key);
  if (!v) { v = make(); map.set(key, v); }
  return v;
}

/** Extrude a side profile (shape x = forward) across the width, rotate so front faces -Z. */
function extrudeProfile(points, width, bevel) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2); // shape +x -> world -Z
  g.computeVertexNormals();
  return g;
}

function bodyGeo(style) {
  const s = BODY_STYLES[style];
  return cached(_geoCache, 'body:' + style, () => extrudeProfile(s.profile, s.W, 0.12));
}
function cabinGeo(style) {
  const s = BODY_STYLES[style];
  return cached(_geoCache, 'cabin:' + style, () => {
    const pts = s.cabin.slice();
    return extrudeProfile(pts, s.W * 0.8, 0.07);
  });
}
function wheelGeos(style) {
  const s = BODY_STYLES[style];
  return cached(_geoCache, 'wheel:' + style, () => {
    const r = s.wheelR, w = s.wheelW;
    const tire = new THREE.CylinderGeometry(r, r, w, 20, 1, false);
    tire.rotateZ(Math.PI / 2);
    const sidewall = new THREE.TorusGeometry(r * 0.82, r * 0.16, 6, 20);
    sidewall.rotateY(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(r * 0.66, r * 0.66, w * 1.02, 16, 1, true);
    rim.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(r * 0.14, r * 0.14, w * 1.08, 8);
    hub.rotateZ(Math.PI / 2);
    const spoke = new THREE.BoxGeometry(w * 0.2, r * 1.22, r * 0.12);
    const caliper = new THREE.BoxGeometry(w * 0.3, r * 0.42, r * 0.28);
    const disc = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 0.1, 16);
    disc.rotateZ(Math.PI / 2);
    return { tire, sidewall, rim, hub, spoke, caliper, disc };
  });
}
function box(key, x, y, z) {
  return cached(_geoCache, `box:${key}:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z));
}

function paintMat(color, quality) {
  const hi = !quality || quality.name !== 'low';
  return cached(_matCache, 'paint:' + color + ':' + hi, () => hi
    ? new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1.0, clearcoatRoughness: 0.06 })
    : new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 }));
}
const mats = {
  glass: () => cached(_matCache, 'glass', () => new THREE.MeshPhysicalMaterial({
    color: 0x0a0f16, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.78, clearcoat: 1, clearcoatRoughness: 0.02 })),
  chrome: () => cached(_matCache, 'chrome', () => new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.12 })),
  trim: () => cached(_matCache, 'trim', () => new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.3, roughness: 0.6 })),
  tire: () => cached(_matCache, 'tire', () => new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0, roughness: 0.92 })),
  rim: () => cached(_matCache, 'rim', () => new THREE.MeshStandardMaterial({ color: 0xbfc4ca, metalness: 0.95, roughness: 0.22 })),
  disc: () => cached(_matCache, 'disc', () => new THREE.MeshStandardMaterial({ color: 0x5a5a5e, metalness: 0.8, roughness: 0.45 })),
  caliper: () => cached(_matCache, 'caliper', () => new THREE.MeshStandardMaterial({ color: 0xc8201a, metalness: 0.3, roughness: 0.4 })),
};
// Lights are per-instance (intensity animated) so they are cloned per car.
function headMat() {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d8, emissiveIntensity: 2.2, roughness: 0.2 });
}
function brakeMat() {
  return new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 0.6, roughness: 0.3 });
}

function mesh(geo, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = false;
  return m;
}

function buildWheel(style, isLeft, quality) {
  const s = BODY_STYLES[style];
  const g = wheelGeos(style);
  const pivot = new THREE.Group(); // steering (rotation.y)
  const spin = new THREE.Group(); // rolling (rotation.x)
  pivot.add(spin);
  spin.add(mesh(g.tire, mats.tire()));
  const side = isLeft ? -1 : 1;
  const sw = mesh(g.sidewall, mats.tire(), side * s.wheelW * 0.42, 0, 0, false);
  spin.add(sw);
  spin.add(mesh(g.rim, mats.rim(), 0, 0, 0, false));
  spin.add(mesh(g.hub, mats.chrome(), 0, 0, 0, false));
  const spokes = !quality || quality.name !== 'low' ? 5 : 3;
  for (let i = 0; i < spokes; i++) {
    const sp = mesh(g.spoke, mats.rim(), side * s.wheelW * 0.38, 0, 0, false);
    sp.rotation.x = (i / spokes) * Math.PI;
    spin.add(sp);
  }
  // disc + caliper don't spin
  pivot.add(mesh(g.disc, mats.disc(), -side * s.wheelW * 0.15, 0, 0, false));
  const cal = mesh(g.caliper, mats.caliper(), -side * s.wheelW * 0.05, s.wheelR * 0.3, -s.wheelR * 0.3, false);
  pivot.add(cal);
  pivot.userData.spin = spin;
  return pivot;
}

/**
 * Build a detailed car. def = catalog entry (uses bodyStyle, color) or {bodyStyle, color}.
 * Returns Group with userData.wheels[4] (FL, FR, RL, RR pivots; pivot.userData.spin rolls),
 * userData.brakeLights (Material[]), userData.headLights (Material[]), userData.body (Group for roll/pitch).
 */
export function buildCarModel(def = {}, quality = null) {
  const style = BODY_STYLES[def.bodyStyle] ? def.bodyStyle : 'coupe';
  const s = BODY_STYLES[style];
  const color = def.color ?? 0xcc2222;
  const root = new THREE.Group();
  root.name = 'car:' + (def.id || style);
  const body = new THREE.Group();
  root.add(body);

  const paint = paintMat(color, quality);
  body.add(mesh(bodyGeo(style), paint));
  const cabin = mesh(cabinGeo(style), mats.glass());
  body.add(cabin);
  // roof panel in paint color over glass
  const roofLen = Math.abs(s.cabin[2][0] - s.cabin[1][0]) * 0.9;
  const roofY = Math.min(s.cabin[1][1], s.cabin[2][1]) + 0.05;
  const roofZ = -(s.cabin[1][0] + s.cabin[2][0]) / 2;
  body.add(mesh(box('roof', s.W * 0.74, 0.05, roofLen), paint, 0, roofY, roofZ));

  // bumpers / sills / grille (trim)
  const front = -s.L / 2, rear = s.L / 2;
  const lowY = s.profile[s.profile.length - 1][1];
  body.add(mesh(box('bump' + style, s.W * 0.96, 0.14, 0.18), mats.trim(), 0, lowY + 0.08, front + 0.06));
  body.add(mesh(box('bump' + style, s.W * 0.96, 0.14, 0.18), mats.trim(), 0, lowY + 0.08, rear - 0.06));
  body.add(mesh(box('sill' + style, 0.06, 0.08, s.L * 0.55), mats.trim(), -s.W / 2, lowY + 0.12, 0));
  body.add(mesh(box('sill' + style, 0.06, 0.08, s.L * 0.55), mats.trim(), s.W / 2, lowY + 0.12, 0));
  body.add(mesh(box('grille' + style, s.W * 0.45, 0.12, 0.04), mats.trim(), 0, lowY + 0.26, front - 0.03, false));
  // chrome trim strips + exhausts + mirrors
  body.add(mesh(box('chromestrip' + style, s.W * 0.5, 0.025, 0.03), mats.chrome(), 0, lowY + 0.34, front - 0.05, false));
  const exG = cached(_geoCache, 'exhaust', () => { const g = new THREE.CylinderGeometry(0.045, 0.05, 0.2, 10); g.rotateX(Math.PI / 2); return g; });
  const exN = style === 'muscle' || style === 'super' ? 2 : 1;
  for (let i = 0; i < exN; i++) {
    const x = exN === 1 ? s.W * 0.3 : (i ? 1 : -1) * s.W * 0.3;
    body.add(mesh(exG, mats.chrome(), x, lowY + 0.06, rear + 0.04, false));
  }
  const mirrorG = box('mirror', 0.16, 0.08, 0.12);
  const mirZ = -s.cabin[3][0] + 0.15;
  body.add(mesh(mirrorG, paint, -s.W / 2 - 0.05, s.cabin[3][1] + 0.08, mirZ, false));
  body.add(mesh(mirrorG, paint, s.W / 2 + 0.05, s.cabin[3][1] + 0.08, mirZ, false));

  // lights
  const headLights = [], brakeLights = [];
  const frontTop = s.profile.find((p) => p[0] > 0 && p[1] < 0.8) || [s.L / 2, 0.6];
  const hY = Math.min(frontTop[1], 0.75) - 0.04;
  const hg = box('headlamp', s.W * 0.2, 0.09, 0.06);
  for (const sx of [-1, 1]) {
    const hm = headMat(); headLights.push(hm);
    body.add(mesh(hg, hm, sx * s.W * 0.33, hY, front + 0.04, false));
    const bm = brakeMat(); brakeLights.push(bm);
    body.add(mesh(box('taillamp', s.W * 0.24, 0.08, 0.05), bm, sx * s.W * 0.32, s.profile[1][1] - 0.08, rear + 0.01, false));
  }

  // spoiler for super / muscle ducktail
  if (style === 'super') {
    const wing = mesh(box('wing', s.W * 0.92, 0.04, 0.32), mats.trim(), 0, 1.02, rear - 0.25);
    wing.rotation.x = -0.08;
    body.add(wing);
    for (const sx of [-1, 1]) body.add(mesh(box('wingpost', 0.05, 0.22, 0.1), mats.trim(), sx * s.W * 0.32, 0.9, rear - 0.25, false));
    body.add(mesh(box('diffuser', s.W * 0.8, 0.06, 0.3), mats.trim(), 0, 0.12, rear - 0.1, false));
  } else if (style === 'muscle') {
    body.add(mesh(box('lip', s.W * 0.86, 0.05, 0.16), paint, 0, 0.92, rear - 0.12, false));
    body.add(mesh(box('scoop', s.W * 0.3, 0.07, 0.6), mats.trim(), 0, 0.97, front + 0.9, false));
  } else if (style === 'suv') {
    for (const sx of [-1, 1]) body.add(mesh(box('rail', 0.04, 0.04, 1.8), mats.chrome(), sx * s.W * 0.34, 1.79, -0.8, false));
  }

  // wheels: FL, FR, RL, RR
  const wheels = [];
  const hw = s.W / 2 - s.wheelW / 2 + 0.02;
  const pos = [[-hw, -s.axle[0]], [hw, -s.axle[0]], [-hw, -s.axle[1]], [hw, -s.axle[1]]];
  pos.forEach(([x, z], i) => {
    const w = buildWheel(style, x < 0, quality);
    w.position.set(x, s.wheelR, z);
    w.userData.front = i < 2;
    root.add(w);
    wheels.push(w);
  });

  root.userData.wheels = wheels;
  root.userData.brakeLights = brakeLights;
  root.userData.headLights = headLights;
  root.userData.body = body;
  root.userData.style = style;
  root.userData.wheelR = s.wheelR;
  root.userData.spinAcc = 0;
  root.userData.roll = 0;
  root.userData.pitch = 0;
  root.userData.lastSpeed = 0;
  return root;
}

/**
 * Animate a car from a VehiclePhysics-like object:
 * { position, quaternion|heading, speed, wheelSpin?:number[4] (radians), wheelSteer, input?{brake}, braking?, steer? }
 * Pass dt as 3rd arg for smoother body roll (defaults 1/60).
 */
export function updateCarModel(group, physics, dt = 1 / 60) {
  if (!group || !physics) return;
  const ud = group.userData;
  if (physics.position) group.position.copy(physics.position);
  if (physics.quaternion) group.quaternion.copy(physics.quaternion);
  else if (typeof physics.heading === 'number') group.rotation.set(0, physics.heading, 0);

  const speed = physics.speed || 0;
  const spinArr = physics.wheelSpin;
  if (!spinArr) ud.spinAcc = (ud.spinAcc + (speed * dt) / ud.wheelR) % (Math.PI * 2);
  const steer = physics.wheelSteer ?? (physics.steer || 0) * 0.5;
  for (let i = 0; i < 4; i++) {
    const w = ud.wheels[i];
    w.userData.spin.rotation.x = -(spinArr ? spinArr[i] || 0 : ud.spinAcc);
    if (w.userData.front) w.rotation.y = steer;
  }

  // body roll/pitch (visual only, on inner body group)
  const accel = (speed - ud.lastSpeed) / Math.max(dt, 1e-4);
  ud.lastSpeed = speed;
  const targetRoll = -steer * Math.min(1, Math.abs(speed) / 30) * 0.06;
  const targetPitch = THREE.MathUtils.clamp(accel * 0.004, -0.04, 0.04);
  const k = 1 - Math.exp(-dt * 6);
  ud.roll += (targetRoll - ud.roll) * k;
  ud.pitch += (targetPitch - ud.pitch) * k;
  ud.body.rotation.z = ud.roll;
  ud.body.rotation.x = ud.pitch;

  let braking = false;
  if (typeof physics.braking === 'boolean') braking = physics.braking;
  else if (typeof physics.brake === 'number') braking = physics.brake > 0.05;
  else if (physics.input) braking = physics.input.brake > 0.05;
  const bi = braking ? 4 : 0.6;
  for (const m of ud.brakeLights) m.emissiveIntensity = bi;
}

export function disposeCarModelCache() {
  for (const g of _geoCache.values()) {
    if (g.isBufferGeometry) g.dispose();
    else for (const k in g) g[k].dispose && g[k].dispose();
  }
  for (const m of _matCache.values()) m.dispose();
  _geoCache.clear();
  _matCache.clear();
}
