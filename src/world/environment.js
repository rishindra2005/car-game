// Sky, sun/moon, hemisphere light, fog, environment map and rain.
// Uses only stock materials (MeshBasic/PointsMaterial/LineBasic) so it works with both WebGLRenderer and WebGPURenderer.
import * as THREE from 'three';
import { radialTexture } from './city.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const PRESETS = {
  // clear day: blue zenith -> pale horizon haze, bright warm sun
  day: {
    top: 0x2c6cd2, mid: 0x7fb3ec, horizon: 0xd9e8f4, glow: 0xfff4dc, fog: 0xcfe0ee, fogDensity: 0.00042,
    sun: 0xfff0d6, sunIntensity: 3.4, sunDir: [0.5, 0.62, 0.36], hemiSky: 0xbcd8ff, hemiGround: 0x8a8274, hemi: 1.0,
    env: 0.9, exposure: 1.05, stars: 0, rain: false, wet: 0, clouds: 26, cloudColor: 0xffffff, cloudOpacity: 0.85, disc: 0xfff6e0, discGain: 4,
  },
  // golden hour: warm orange/pink horizon, low sun, long soft shadows
  dusk: {
    top: 0x34508f, mid: 0xd4909a, horizon: 0xffb680, glow: 0xffd08a, fog: 0xe6ab8a, fogDensity: 0.00055,
    sun: 0xffb26e, sunIntensity: 2.6, sunDir: [0.78, 0.26, -0.42], hemiSky: 0x9fb2e2, hemiGround: 0x74604f, hemi: 0.7,
    env: 0.7, exposure: 1.05, stars: 0, rain: false, wet: 0, clouds: 20, cloudColor: 0xffc7a4, cloudOpacity: 0.8, disc: 0xffc078, discGain: 4,
  },
  // overcast daytime rain
  rain: {
    top: 0x6c7783, mid: 0x8b959f, horizon: 0xaab2b9, glow: 0xb9c0c6, fog: 0x9ca5ad, fogDensity: 0.0015,
    sun: 0xd2d9e0, sunIntensity: 0.9, sunDir: [-0.3, 0.8, 0.2], hemiSky: 0xb0bac6, hemiGround: 0x6c6862, hemi: 1.0,
    env: 0.7, exposure: 0.95, stars: 0, rain: true, wet: 1, clouds: 0, cloudColor: 0x8a929a, cloudOpacity: 0.6, disc: 0xc8cfd6, discGain: 0.9,
  },
  // moonlit night
  night: {
    top: 0x050a18, mid: 0x0e1a33, horizon: 0x26324c, glow: 0x3a4a6c, fog: 0x151d2e, fogDensity: 0.001,
    sun: 0xa9bfff, sunIntensity: 0.55, sunDir: [-0.4, 0.7, -0.3], hemiSky: 0x2c3c60, hemiGround: 0x16161a, hemi: 0.45,
    env: 0.3, exposure: 1.0, stars: 0.85, rain: false, wet: 0, clouds: 10, cloudColor: 0x2c3650, cloudOpacity: 0.5, disc: 0xe4eaff, discGain: 2.5,
  },
};

function skyGeometry(p, sunDir) {
  const g = new THREE.SphereGeometry(1, 48, 24);
  const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
  const top = new THREE.Color(p.top), mid = new THREE.Color(p.mid), hor = new THREE.Color(p.horizon), glow = new THREE.Color(p.glow), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) c.copy(hor);
    else if (y < 0.22) c.lerpColors(hor, mid, Math.pow(y / 0.22, 0.8));
    else c.lerpColors(mid, top, Math.min(1, (y - 0.22) / 0.6));
    const sd = Math.max(0, pos.getX(i) * sunDir.x + y * sunDir.y + pos.getZ(i) * sunDir.z);
    c.lerp(glow, Math.pow(sd, 5) * 0.75); // warm haze around the sun
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

export function setupEnvironment(engine, timeOfDay = 'day') {
  const { scene, renderer, camera } = engine;
  const quality = engine.quality || {};
  const p = PRESETS[timeOfDay] || PRESETS.day;
  const root = new THREE.Group();
  root.name = 'environment';
  const disposables = [];
  const own = (x) => (disposables.push(x), x);
  const far = Math.max(600, (quality.drawDistance || 900) * 1.6);

  const sunDir = new THREE.Vector3(...p.sunDir).normalize();
  // Sky dome (follows camera, drawn first, ignores fog)
  const skyMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  const sky = new THREE.Mesh(own(skyGeometry(p, sunDir)), skyMat);
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
      transparent: true, opacity: p.stars, depthWrite: false })));
    stars.scale.setScalar(far * 0.85);
    stars.renderOrder = -9;
    stars.frustumCulled = false;
    root.add(stars);
  }

  // Moon / sun disc
  const disc = new THREE.Mesh(own(new THREE.CircleGeometry(1, 24)), own(new THREE.MeshBasicMaterial({
    color: new THREE.Color(p.disc).multiplyScalar(p.discGain),
    fog: false, depthWrite: false })));
  disc.scale.setScalar(far * (timeOfDay === 'night' ? 0.022 : 0.03));
  disc.renderOrder = -8;
  disc.frustumCulled = false;
  root.add(disc);

  // Soft clouds: instanced horizontal puffs (radial alpha) on a slowly drifting layer that follows the camera
  let clouds = null;
  if (p.clouds) {
    const puffs = p.clouds * 5;
    const mat = own(new THREE.MeshBasicMaterial({ color: p.cloudColor, alphaMap: own(radialTexture()), transparent: true, opacity: p.cloudOpacity,
      depthWrite: false, fog: false, side: THREE.DoubleSide }));
    clouds = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2)), mat, puffs);
    const m = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let c = 0; c < p.clouds; c++) {
      const a = r() * Math.PI * 2, rad = (0.18 + 0.6 * r()) * far, y = (0.13 + 0.09 * r()) * far, size = (0.1 + 0.14 * r()) * far;
      for (let k = 0; k < 5; k++) {
        v.set(Math.cos(a) * rad + (r() - 0.5) * size * 1.4, y + (r() - 0.5) * size * 0.08, Math.sin(a) * rad + (r() - 0.5) * size * 0.8);
        const w = size * (0.6 + 0.6 * r());
        m.compose(v, q4, sc.set(w * 1.5, 1, w));
        clouds.setMatrixAt(c * 5 + k, m);
      }
    }
    clouds.frustumCulled = false;
    clouds.renderOrder = -7;
    clouds.name = 'clouds';
    root.add(clouds);
  }

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
    sun.shadow.radius = 3; // soft penumbra
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
    rain = new THREE.LineSegments(g, own(new THREE.LineBasicMaterial({ color: 0xdde4ea, transparent: true, opacity: 0.3, depthWrite: false })));
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
      m.roughness = Math.max(0.1, m.roughness * 0.28);
      m.metalness = Math.max(m.metalness, 0.15);
      m.color.multiplyScalar(0.7);
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
      if (clouds) { clouds.position.copy(camPos); clouds.rotation.y += dt * 0.003; }
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
