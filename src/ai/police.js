// Police pursuit system: heat 0..5, kinematic pursuit units with flashing light bars.
import * as THREE from 'three';
import { buildCarModel } from '../vehicles/carModel.js';

export const POLICE_CONFIG = {
  bustRadius: 12,        // m: units within this distance count as surrounding
  bustSpeed: 4,          // m/s: player must be slower than this
  bustTime: 3,           // s slow & surrounded -> busted
  escapeTime: 10,        // s out of range -> escaped
  escapeRange: (heat) => 140 + heat * 20,
  unitsForHeat: (heat) => (heat <= 0 ? 0 : Math.min(6, heat + 1)),
  unitMaxSpeed: (heat) => 38 + heat * 7,
  heatInterval: 35,      // s of continued pursuit per +1 heat
};

const POLICE_DEF = { id: 'police', bodyStyle: 'coupe', color: 0x0d0f14 };
const _d = new THREE.Vector3();

function makeLightBar() {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.45, 0.1, 0.22);
  const red = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff0a0a, emissiveIntensity: 0 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x000030, emissive: 0x1a40ff, emissiveIntensity: 0 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.26), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  const r = new THREE.Mesh(geo, red); r.position.x = -0.32;
  const b = new THREE.Mesh(geo, blue); b.position.x = 0.32;
  r.position.y = b.position.y = 0.07;
  g.add(base, r, b);
  g.userData = { red, blue };
  return g;
}

export class PoliceSystem {
  /**
   * @param {THREE.Scene|null} scene  (null = headless, no visuals)
   * @param {Track} track
   */
  constructor(scene, track, opts = {}) {
    this.scene = scene;
    this.track = track;
    this.cfg = { ...POLICE_CONFIG, ...opts };
    this.heat = 0;
    this.active = false;
    this.units = [];
    this.bustTimer = 0;
    this.escapeTimer = 0;
    this.pursuitTime = 0;
    this.time = 0;
    this._busted = [];
    this._escaped = [];
    this._heatCb = [];
  }

  onBusted(cb) { this._busted.push(cb); return this; }
  onEscaped(cb) { this._escaped.push(cb); return this; }
  onHeatChange(cb) { this._heatCb.push(cb); return this; }

  /** 0..1 progress for HUD meters. */
  get bustProgress() { return this.bustTimer / this.cfg.bustTime; }
  get escapeProgress() { return this.escapeTimer / this.cfg.escapeTime; }

  setHeat(h) {
    const nh = THREE.MathUtils.clamp(Math.round(h), 0, 5);
    if (nh !== this.heat) {
      this.heat = nh;
      for (const cb of this._heatCb) cb(nh);
    }
  }

  addHeat(n = 1) {
    this.setHeat(this.heat + n);
    if (this.heat > 0 && !this.active) this.triggerPursuit();
  }

  /** Start a pursuit (heat at least 1). Optional player for spawn placement. */
  triggerPursuit(player = this._lastPlayer) {
    if (this.heat < 1) this.setHeat(1);
    this.active = true;
    this.bustTimer = 0;
    this.escapeTimer = 0;
    this.pursuitTime = 0;
    if (player) this._syncUnits(player);
  }

  _spawnUnit(player, idx) {
    const unit = {
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), heading: 0, speed: 0,
      radius: 2.2, mass: 1600, model: null, lightBar: null, phase: idx * 0.37,
    };
    // spawn behind the player along the track (or directly behind if no track)
    const back = 70 + idx * 18;
    let placed = false;
    if (this.track && this.track.progressAt && this.track.pointAt) {
      const len = this.track.spline && this.track.spline.getLength ? this.track.spline.getLength() : 2000;
      const u = this.track.progressAt(player.position) - back / len;
      unit.position.copy(this.track.pointAt(((u % 1) + 1) % 1));
      unit.position.x += ((idx % 2) * 2 - 1) * 2.5;
      placed = true;
    }
    if (!placed) {
      const h = player.heading || 0;
      unit.position.set(player.position.x + Math.sin(h) * back, 0, player.position.z + Math.cos(h) * back);
    }
    unit.heading = Math.atan2(-(player.position.x - unit.position.x), -(player.position.z - unit.position.z));
    if (this.scene) {
      unit.model = buildCarModel(POLICE_DEF);
      unit.lightBar = makeLightBar();
      unit.lightBar.position.set(0, 1.36, 0.05);
      unit.model.userData.body.add(unit.lightBar);
      this.scene.add(unit.model);
    }
    return unit;
  }

  _removeUnit(u) {
    if (u.model && this.scene) this.scene.remove(u.model);
  }

  _syncUnits(player) {
    const want = this.active ? this.cfg.unitsForHeat(this.heat) : 0;
    while (this.units.length < want) this.units.push(this._spawnUnit(player, this.units.length));
    while (this.units.length > want) this._removeUnit(this.units.pop());
  }

  _end(kind) {
    this.active = false;
    this.bustTimer = 0;
    this.escapeTimer = 0;
    for (const u of this.units) this._removeUnit(u);
    this.units.length = 0;
    if (kind === 'escaped') {
      this.setHeat(0);
      for (const cb of this._escaped) cb();
    } else {
      const h = this.heat;
      this.setHeat(0);
      for (const cb of this._busted) cb(h);
    }
  }

  /**
   * @param {number} dt
   * @param {{position:THREE.Vector3, speed:number, heading?:number}} player
   */
  update(dt, player) {
    this.time += dt;
    this._lastPlayer = player;
    if (!this.active || !player) return;
    this.pursuitTime += dt;
    if (this.pursuitTime > this.cfg.heatInterval * this.heat && this.heat < 5) this.setHeat(this.heat + 1);
    this._syncUnits(player);

    const maxSp = this.cfg.unitMaxSpeed(this.heat);
    const pSpeed = Math.abs(player.speed || 0);
    let near = 0;
    let anyInRange = false;
    const escR = this.cfg.escapeRange(this.heat);
    this.units.forEach((u, i) => {
      // target: ring position around player so units surround
      const ang = (i / Math.max(1, this.units.length)) * Math.PI * 2 + (player.heading || 0);
      const ring = pSpeed < this.cfg.bustSpeed * 2 ? 5.5 : 0;
      const tx = player.position.x + Math.sin(ang) * ring;
      const tz = player.position.z + Math.cos(ang) * ring;
      _d.set(tx - u.position.x, 0, tz - u.position.z);
      const dist = _d.length();
      const desired = Math.atan2(-_d.x, -_d.z);
      let err = desired - u.heading;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      const turnRate = 1.8 + this.heat * 0.15;
      u.heading += THREE.MathUtils.clamp(err, -turnRate * dt, turnRate * dt);
      let target = Math.min(maxSp, pSpeed + 6 + dist * 0.15);
      if (dist < 4) target = Math.min(target, pSpeed);
      if (Math.abs(err) > 1.2) target = Math.min(target, 12);
      const acc = target > u.speed ? 9 : -14;
      u.speed = acc > 0 ? Math.min(target, u.speed + acc * dt) : Math.max(target, u.speed + acc * dt);
      u.velocity.set(-Math.sin(u.heading) * u.speed, 0, -Math.cos(u.heading) * u.speed);
      u.position.addScaledVector(u.velocity, dt);
      if (this.track && this.track.constrain) this.track.constrain(u.position, u.velocity);
      if (this.track && this.track.heightAt) u.position.y = this.track.heightAt(u.position.x, u.position.z) || 0;
      const pd = u.position.distanceTo(player.position);
      if (pd < this.cfg.bustRadius) near++;
      if (pd < escR) anyInRange = true;
      if (u.model) {
        u.model.position.copy(u.position);
        u.model.rotation.set(0, u.heading, 0);
        const ph = Math.floor((this.time + u.phase) * 8) % 4;
        const red = ph === 0 || ph === 1 ? 6 : 0.2;
        u.lightBar.userData.red.emissiveIntensity = (ph === 0 || ph === 2) ? red : 0.2;
        u.lightBar.userData.blue.emissiveIntensity = (ph === 1 || ph === 3) ? 6 : 0.2;
      }
    });

    // busted: slow and surrounded (>=2 units nearby, or all if only one)
    const needed = Math.min(2, this.units.length);
    if (pSpeed < this.cfg.bustSpeed && needed > 0 && near >= needed) this.bustTimer += dt;
    else this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    if (this.bustTimer >= this.cfg.bustTime) { this._end('busted'); return; }

    if (!anyInRange) this.escapeTimer += dt;
    else this.escapeTimer = 0;
    if (this.escapeTimer >= this.cfg.escapeTime) this._end('escaped');
  }

  /** Colliders for player collision: [{position, velocity, radius, mass}] */
  getColliders() { return this.units; }

  dispose() {
    for (const u of this.units) this._removeUnit(u);
    this.units.length = 0;
  }
}
