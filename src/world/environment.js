// Sky, sun/moon, hemisphere light, fog, environment map and rain.
// Uses only stock materials (MeshBasic/PointsMaterial/LineBasic) so it works with both WebGLRenderer and WebGPURenderer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const PRESETS = {
  night: {
    top: 0x02040c, mid: 0x0b1430, horizon: 0x2a2140, fog: 0x0c1020, fogDensity: 0.0016,
    sun: 0x9fb4ff, sunIntensity: 0.35, sunDir: [-0.4, 0.75, -0.3], hemiSky: 0x223355, hemiGround: 0x0a0a10, hemi: 0.35,
    env: 0.35, exposure: 1.0, stars: true, rain: false, wet: 0,
  },
  dusk: {
    top: 0x101a40, mid: 0x5a3a6a, horizon: 0xff8a4a, fog: 0x4a3550, fogDensity: 0.0012,
    sun: 0xffa060, sunIntensity: 1.6, sunDir: [0.8, 0.18, -0.4], hemiSky: 0x7a6aa0, hemiGround: 0x2a1a18, hemi: 0.5,
    env: 0.6, exposure: 1.0, stars: true, rain: false, wet: 0,
  },
  day: {
    top: 0x2a6fd0, mid: 0x7fb2ea, horizon: 0xd8e6f2, fog: 0xbcd0e2, fogDensity: 0.0007,
    sun: 0xfff2dd, sunIntensity: 3.0, sunDir: [0.4, 0.85, 0.3], hemiSky: 0xbcd8ff, hemiGround: 0x4a4038, hemi: 0.8,
    env: 1.0, exposure: 0.9, stars: false, rain: false, wet: 0,
  },
  rain: {
    top: 0x05070c, mid: 0x111722, horizon: 0x262c38, fog: 0x161b24, fogDensity: 0.0028,
    sun: 0x8090b0, sunIntensity: 0.25, sunDir: [-0.3, 0.8, 0.2], hemiSky: 0x334055, hemiGround: 0x0c0c10, hemi: 0.45,
    env: 0.45, exposure: 1.05, stars: false, rain: true, wet: 1,
  },
};

function skyGeometry(p) {
  const g = new THREE.SphereGeometry(1, 48, 24);
  const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
  const top = new THREE.Color(p.top), mid = new THREE.Color(p.mid), hor = new THREE.Color(p.horizon), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) c.copy(hor).multiplyScalar(0.6);
    else if (y < 0.25) c.lerpColors(hor, mid, y / 0.25);
    else c.lerpColors(mid, top, Math.min(1, (y - 0.25) / 0.6));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

export function setupEnvironment(engine, timeOfDay = 'night') {
  const { scene, renderer, camera } = engine;
  const quality = engine.quality || {};
  const p = PRESETS[timeOfDay] || PRESETS.night;
  const root = new THREE.Group();
  root.name = 'environment';
  const disposables = [];
  const own = (x) => (disposables.push(x), x);
  const far = Math.max(600, (quality.drawDistance || 900) * 1.6);

  // Sky dome (follows camera, drawn first, ignores fog)
  const skyMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  const sky = new THREE.Mesh(own(skyGeometry(p)), skyMat);
  sky.scale.setScalar(far * 0.9);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  root.add(sky);

  let stars = null;
  if (p.stars) {
    const N = 1500, arr = new Float32Array(N * 3);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N; i++) {
      const th = r() * Math.PI * 2, y = 0.08 + r() * 0.92, q = Math.sqrt(1 - y * y);
      arr[i * 3] = Math.cos(th) * q; arr[i * 3 + 1] = y; arr[i * 3 + 2] = Math.sin(th) * q;
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    stars = new THREE.Points(g, own(new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false,
      transparent: true, opacity: timeOfDay === 'dusk' ? 0.35 : 0.85, depthWrite: false })));
    stars.scale.setScalar(far * 0.85);
    stars.renderOrder = -9;
    stars.frustumCulled = false;
    root.add(stars);
  }

  // Moon / sun disc
  const sunDir = new THREE.Vector3(...p.sunDir).normalize();
  const disc = new THREE.Mesh(own(new THREE.CircleGeometry(1, 24)), own(new THREE.MeshBasicMaterial({
    color: new THREE.Color(timeOfDay === 'day' ? 0xfff6e0 : timeOfDay === 'dusk' ? 0xffb070 : 0xdfe6ff).multiplyScalar(timeOfDay === 'rain' ? 0.2 : 3),
    fog: false, depthWrite: false })));
  disc.scale.setScalar(far * 0.03);
  disc.renderOrder = -8;
  disc.frustumCulled = false;
  root.add(disc);

  // Lights
  const hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemi);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(p.sun, p.sunIntensity);
  sun.name = 'sun';
  const shadowSize = quality.shadowMapSize || 2048;
  if (quality.shadows !== false && renderer) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const ext = 90;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 600 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  }
  root.add(sun);
  root.add(sun.target);

  // Fog
  const prevFog = scene.fog, prevBg = scene.background, prevEnv = scene.environment, prevEnvI = scene.environmentIntensity;
  scene.fog = new THREE.FogExp2(p.fog, p.fogDensity * (900 / (quality.drawDistance || 900)));
  scene.background = new THREE.Color(p.horizon);

  // Environment map (PMREM of RoomEnvironment on WebGL; WebGPU handles plain env via its own PMREM node)
  let envRT = null;
  if (renderer && !engine.isWebGPU) {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      envRT = pmrem.fromScene(room, 0.04);
      room.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      pmrem.dispose();
      scene.environment = envRT.texture;
    } catch (e) { /* headless */ }
  }
  // WebGPU: no PMREM-from-scene here; lighting comes from hemi/sun and the sky-coloured background.
  scene.environmentIntensity = p.env;
  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = p.exposure;
  }

  // Rain: streaks as line segments around the camera (CPU-updated, no custom shaders)
  let rain = null, rainPos = null, rainVel = null;
  const RAIN_BOX = 60, RAIN_H = 40;
  if (p.rain) {
    const N = quality.name === 'low' ? 1500 : quality.name === 'high' || quality.name === 'ultra' ? 6000 : 3500;
    rainPos = new Float32Array(N * 6);
    rainVel = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * RAIN_BOX * 2, y = Math.random() * RAIN_H, z = (Math.random() - 0.5) * RAIN_BOX * 2;
      rainVel[i] = 22 + Math.random() * 8;
      rainPos.set([x, y, z, x + 0.05, y + 0.9, z + 0.03], i * 6);
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    rain = new THREE.LineSegments(g, own(new THREE.LineBasicMaterial({ color: 0x9fb0c8, transparent: true, opacity: 0.35, depthWrite: false })));
    rain.frustumCulled = false;
    rain.name = 'rain';
    root.add(rain);
  }

  // Wet roads: lower roughness, darker albedo on materials tagged userData.wetable (by city.js)
  const wetDone = new WeakSet();
  function applyWet() {
    if (!p.wet) return;
    scene.traverse((o) => {
      const m = o.material;
      if (!m || !m.userData?.wetable || wetDone.has(m)) return;
      wetDone.add(m);
      m.roughness = Math.max(0.08, m.roughness * 0.22);
      m.metalness = Math.max(m.metalness, 0.15);
      m.color.multiplyScalar(0.6);
      m.envMapIntensity = 1.6;
      m.needsUpdate = true;
    });
  }
  applyWet();

  scene.add(root);
  const camPos = new THREE.Vector3();
  let wetTimer = 0;

  return {
    sun, hemi, preset: p, timeOfDay,
    update(dt) {
      const cam = engine.camera || camera;
      if (cam) cam.getWorldPosition(camPos);
      sky.position.copy(camPos);
      if (stars) stars.position.copy(camPos);
      disc.position.copy(camPos).addScaledVector(sunDir, far * 0.8);
      disc.lookAt(camPos);
      // shadow frustum follows the camera (snapped to texels to avoid shimmering)
      const snap = (180 / shadowSize);
      const tx = Math.round(camPos.x / snap) * snap, tz = Math.round(camPos.z / snap) * snap;
      sun.target.position.set(tx, camPos.y, tz);
      sun.position.set(tx, camPos.y, tz).addScaledVector(sunDir, 250);
      sun.target.updateMatrixWorld();
      if (p.wet && (wetTimer -= dt) <= 0) { wetTimer = 2; applyWet(); }
      if (rain) {
        const a = rainPos, N = rainVel.length;
        for (let i = 0; i < N; i++) {
          const o = i * 6, dy = rainVel[i] * dt;
          a[o + 1] -= dy; a[o + 4] -= dy;
          if (a[o + 1] < 0) { a[o + 1] += RAIN_H; a[o + 4] += RAIN_H; }
        }
        rain.position.set(Math.round(camPos.x / 2) * 2 - 0, camPos.y - RAIN_H * 0.4, Math.round(camPos.z / 2) * 2);
        rain.geometry.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(root);
      scene.fog = prevFog; scene.background = prevBg; scene.environment = prevEnv;
      if (prevEnvI !== undefined) scene.environmentIntensity = prevEnvI;
      envRT?.dispose();
      sun.shadow.map?.dispose();
      for (const d of disposables) d.dispose?.();
    },
  };
}
