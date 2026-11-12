import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { VehiclePhysics } from './physics/vehicle.js';
import { initWasm, isWasmActive } from './physics/wasm.js';
import { resolveCarCollision } from './physics/collision.js';
import { Track } from './world/track.js';
import { TRACKS } from './world/tracks.js';
import { buildCity } from './world/city.js';
import { setupEnvironment } from './world/environment.js';
import { setupPost } from './world/post.js';
import { PhotoMode } from './world/pathtracer.js';
import { CARS, applyUpgrades } from './vehicles/catalog.js';
import { buildCarModel, updateCarModel } from './vehicles/carModel.js';
import { RivalDriver } from './ai/rivals.js';
import { TrafficSystem } from './ai/traffic.js';
import { PoliceSystem } from './ai/police.js';
import { Career } from './game/career.js';
import { EVENTS } from './game/events.js';
import { getAct, getEventDialogue } from './game/story.js';
import { RaceSession } from './game/race.js';
import { Input } from './game/input.js';
import { ChaseCamera } from './game/camera.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { AudioSystem } from './audio/audio.js';
import './ui/styles.css';

const SETTINGS_KEY = 'velocityRush.settings';
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

const app = document.getElementById('app');
const uiRoot = document.getElementById('ui');
const settings = { preset: 'medium', resolution: 'native', renderScale: 1, renderer: 'auto', dynamicResolution: true, volume: 0.7, traffic: 'medium', ...loadSettings() };

const engine = new Engine(app, settings);
const career = new Career(); try { career.load(); } catch (e) { console.warn(e); }
const input = new Input(window);
const audio = new AudioSystem();
let hud, menus, chase, post, photo;

/** Everything belonging to the active race; torn down between events. */
let world = null;
let paused = false;

function storyLines(event, when) {
  const lines = [];
  const act = getAct(event?.chapter);
  const ed = getEventDialogue(event?.id);
  if (when === 'pre') {
    // Act intro plays before the first event of each act.
    if (act?.intro && event === firstEventOfAct(event.chapter)) lines.push(...act.intro);
    if (ed?.pre?.length) lines.push(...ed.pre);
  } else {
    if (ed?.post?.length) lines.push(...ed.post);
    if (event?.boss && act?.outro) lines.push(...act.outro);
  }
  return lines.length ? lines : null;
}
function firstEventOfAct(ch) { return EVENTS.find(e => e.chapter === ch); }

let backdrop = null;
function disposeWorld() {
  if (backdrop) { backdrop.city?.dispose?.(); backdrop.env?.dispose?.(); backdrop = null; }
  if (!world) { engine.scene.clear(); return; }
  world.city?.dispose?.();
  world.env?.dispose?.();
  world.traffic?.dispose?.();
  world.police?.dispose?.();
  engine.scene.traverse(o => {
    if (o.isMesh || o.isInstancedMesh) { o.geometry?.dispose?.(); }
  });
  engine.scene.clear();
  world = null;
}

function startEvent(event, carId) {
  disposeWorld();
  const def = TRACKS.find(t => t.id === event.trackId) || TRACKS[0];
  const track = new Track(def);
  const scene = engine.scene;
  const q = { ...engine.quality, traffic: Math.round(engine.quality.traffic * ({ off: 0, low: 0.4, medium: 1, high: 1.6 }[settings.traffic] ?? 1)) };

  const env = setupEnvironment(engine, event.timeOfDay || def.timeOfDay || 'night');
  const city = buildCity(scene, track, q);

  const carDef = CARS.find(c => c.id === carId) || CARS[0];
  const spec = applyUpgrades(carDef.spec, career.getUpgrades(carDef.id));
  const player = { def: carDef, physics: new VehiclePhysics(spec), model: buildCarModel(carDef, q), isPlayer: true };
  const start = track.startTransform(0);
  player.physics.reset(start.position, start.heading);
  scene.add(player.model);

  // Rival racers
  const rivals = [];
  const rivalCount = event.type === 'timeTrial' || event.type === 'pursuit' ? 0 : (event.rivals ?? 5);
  for (let i = 0; i < rivalCount; i++) {
    const rd = CARS[(CARS.indexOf(carDef) + 1 + i) % CARS.length];
    const phys = new VehiclePhysics(rd.spec);
    const st = track.startTransform(i + 1);
    phys.reset(st.position, st.heading);
    const model = buildCarModel(rd, q);
    scene.add(model);
    const skill = Math.min(1, 0.55 + 0.08 * (event.chapter ?? 1) + 0.04 * i);
    rivals.push({ def: rd, physics: phys, model, driver: new RivalDriver(rd, track, skill, phys) });
  }

  const traffic = event.type === 'timeTrial' || q.traffic === 0 ? null : new TrafficSystem(scene, track, q.traffic, q);
  const police = (event.type === 'pursuit' || event.police) ? new PoliceSystem(scene, track) : null;
  if (police && event.type === 'pursuit') police.triggerPursuit();

  rivalOthers = [player.physics, ...rivals.map(r => r.physics)];
  const race = new RaceSession({ engine, event, track, playerCar: player, rivals: rivals.map(r => ({ physics: r.physics, name: r.def.name })), police });
  world = { event, track, city, env, player, rivals, traffic, police, race, finished: false };

  if (police && event.type !== 'pursuit') police.onBusted?.(() => { race.notifyBusted(); });
  hud.setTrack?.(track);
  chase.setMode(chase.mode ?? 0);
  // Snap camera behind the player.
  for (let i = 0; i < 30; i++) chase.update(1 / 60, player.model, player.physics);
  hud.show();
}

function finishRace(extra = {}) {
  if (!world || world.finished) return;
  world.finished = true;
  const { race, event } = world;
  const results = { ...(race.results || {}), ...extra, event };
  const place = results.passed ? (results.place ?? 1) : (results.place ?? 99);
  // Menus.showResults records the result in the career (rewards, unlocks, stats).
  hud.hide();
  const post = storyLines(event, 'post');
  const after = () => menus.showResults(results, () => { showBackdrop(); menus.showMain(); });
  if (post && results.passed) menus.showDialogue(post, after); else after();
}

const tmpV = new THREE.Vector3();
const rivalCtx = {};
let rivalOthers = [];
function update(dt) {
  const s = input.update(dt);
  if (input.wasPressed('pause') && !paused) togglePause();
  if (!world || paused) return;
  if (input.wasPressed('camera')) chase.setMode(((chase.mode ?? 0) + 1) % 4);
  if (input.wasPressed('photo')) photo?.toggle();
  if (photo?.active) { photo.update(); return; }

  const { player, rivals, traffic, police, race, track } = world;
  const canDrive = race.canDrive && !race.finished;
  const pin = canDrive ? s : { throttle: 0, brake: 0, steer: 0, handbrake: true, nitro: false };
  if (input.wasPressed('reset')) {
    const u = track.progressAt(player.physics.position);
    const p = track.pointAt(u), tg = track.tangentAt(u);
    player.physics.reset(p, Math.atan2(-tg.x, -tg.z));
  }
  player.physics.update(dt, pin, track);
  updateCarModel(player.model, player.physics);

  for (const r of rivals) {
    rivalCtx.playerProgress = race.player.raw;
    rivalCtx.others = rivalOthers; rivalCtx.raceStarted = canDrive; rivalCtx.track = track;
    r.driver.update(dt, rivalCtx);
    updateCarModel(r.model, r.physics);
    resolveCarCollision(player.physics, r.physics);
  }
  for (let i = 0; i < rivals.length; i++)
    for (let j = i + 1; j < rivals.length; j++) resolveCarCollision(rivals[i].physics, rivals[j].physics);

  if (traffic) {
    traffic.update(dt, player.physics.position);
    const pp = player.physics.position;
    for (const c of traffic.cars || []) {
      const cp = c.position || tmpV.set(c.x, 0, c.z);
      const dx = cp.x - pp.x, dz = cp.z - pp.z;
      if (dx * dx + dz * dz < 9) {
        const hit = resolveCarCollision(player.physics, c);
        if (hit) audio.playCollision(Math.min(1, player.physics.speed / 40));
      }
    }
  }
  if (police) {
    police.update(dt, player.physics);
    for (const u of police.getColliders?.() || []) resolveCarCollision(player.physics, u);
  }

  race.setNitroInput?.(pin.nitro); race.update(dt);
  world.city.update?.(dt, engine.camera);
  world.env.update?.(dt);
  chase.update(dt, player.model, player.physics);

  const ph = player.physics;
  audio.update({ rpm: ph.rpm, throttle: pin.throttle, speed: ph.speed, drifting: ph.drifting, nitro: pin.nitro && ph.nitro > 0 });
  const hs = race.hudState();
  hs.speedKmh = Math.abs(ph.speed) * 3.6; hs.speed = ph.speed; hs.rpm = ph.rpm; hs.gear = ph.gear; hs.nitro = ph.nitro;
  hs.drifting = ph.drifting; hs.heat = police?.heat ?? 0; hs.player = ph; hs.fps = engine.fps;
  hs.others = rivalOthers; hs.police = police?.units?.map(u => u.position) || null;
  hud.update(hs);
  if (race.finished) finishRace();
}

function togglePause() {
  if (!world) return;
  paused = !paused;
  if (paused) menus.showPause(() => { paused = false; }, () => { paused = false; hud.hide(); showBackdrop(); menus.showMain(); });
  else menus.hide();
}

function onStartEvent(event, carId) {
  audio.init?.();
  const pre = storyLines(event, 'pre');
  const go = () => { menus.showLoading?.('Entering ' + (TRACKS.find(t => t.id === event.trackId)?.name || 'the streets') + '…'); setTimeout(() => { startEvent(event, carId); menus.hide(); }, 30); };
  if (pre) menus.showDialogue(pre, go); else go();
}

function onSettingsChange(s) {
  Object.assign(settings, s);
  saveSettings(settings);
  engine.applySettings(settings);
  audio.setVolume?.(settings.volume ?? 0.7);
  if (s.renderer && s.renderer !== engine.settings._activeRenderer) {
    // Renderer backend can only change on reload.
    engine.settings._activeRenderer = s.renderer;
  }
}

/** Attract-mode scene behind the main menu. */
function showBackdrop() {
  disposeWorld();
  const env = setupEnvironment(engine, 'night');
  const track = new Track(TRACKS[0]);
  const city = buildCity(engine.scene, track, engine.quality);
  const show = buildCarModel(CARS[0], engine.quality);
  const st = track.startTransform(0);
  show.position.copy(st.position); show.rotation.y = st.heading;
  engine.scene.add(show);
  backdrop = { env, city, st };
}

async function boot() {
  await Promise.race([initWasm().catch(e => console.warn('wasm', e)), new Promise(r => setTimeout(r, 1500))]);
  await engine.init();
  engine.settings._activeRenderer = settings.renderer;
  chase = new ChaseCamera(engine.camera);
  post = setupPost(engine);
  engine.onResize = (w, h) => post.setSize?.(w, h);
  post.setSize?.(...engine.renderSize);
  engine.renderFn = () => { if (photo?.active) return; post.render(); };
  photo = new PhotoMode(engine);
  hud = new HUD(uiRoot); hud.hide();
  menus = new Menus(uiRoot, { career, onStartEvent, onSettingsChange, settings });
  engine.onUpdate(update);

  showBackdrop();
  let orbit = 0;
  engine.onUpdate((dt) => {
    if (world || !backdrop) return;
    const st = backdrop.st;
    orbit += dt * 0.15;
    engine.camera.position.set(st.position.x + Math.sin(orbit) * 7, st.position.y + 2.2, st.position.z + Math.cos(orbit) * 7);
    engine.camera.lookAt(st.position.x, st.position.y + 0.6, st.position.z);
    backdrop.env.update?.(dt); backdrop.city.update?.(dt, engine.camera);
  });

  engine.start();
  document.getElementById('boot')?.remove();
  menus.showMain();
  window.__VR_READY = true;
  console.info(`[velocity-rush] renderer=${engine.backend} wasm=${isWasmActive?.() ? 'on' : 'fallback'}`);
}

// Test / automation hooks (used by tests/e2e/smoke.mjs).
window.__VR_TEST = {
  startQuickRace(eventId) {
    const ev = EVENTS.find(e => e.id === eventId) || EVENTS[0];
    startEvent(ev, CARS[0].id); menus.hide();
  },
  stats() {
    return { fps: engine.fps, frame: engine.frame, renderer: engine.backend, gpuBuild: engine.isWebGPU, wasm: isWasmActive?.() ?? false,
      playerSpeed: world?.player?.physics?.speed ?? 0, renderSize: engine.renderSize, dynScale: engine.dynres.scale };
  },
  engine,
};

boot().catch(e => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.textContent = 'Failed to start: ' + e.message;
});
