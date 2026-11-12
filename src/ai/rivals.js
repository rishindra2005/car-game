// Rival AI: follows the track spline racing line, drives a VehiclePhysics via its input.
import * as THREE from 'three';

// Convention: steer +1 = turn right (heading decreases; heading 0 faces -Z, rotation.y = heading).
export const STEER_SIGN = -1;

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _t2 = new THREE.Vector3();

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** heading (0 = -Z) that points from (x,z) to (tx,tz) */
export function headingTo(x, z, tx, tz) {
  return Math.atan2(-(tx - x), -(tz - z));
}

function trackLength(track) {
  if (track._len) return track._len;
  let len = 0;
  if (track.spline && track.spline.getLength) len = track.spline.getLength();
  else {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    a.copy(track.pointAt(0));
    for (let i = 1; i <= 200; i++) { b.copy(track.pointAt(i / 200)); len += a.distanceTo(b); a.copy(b); }
  }
  try { track._len = len; } catch (e) { /* frozen */ }
  return len;
}

export class RivalDriver {
  /**
   * @param {object} car catalog entry (name, spec ...)
   * @param {Track} track
   * @param {number} skill 0..1
   * @param {VehiclePhysics} physics
   */
  constructor(car, track, skill = 0.5, physics = null) {
    this.car = car;
    this.track = track;
    this.skill = THREE.MathUtils.clamp(skill, 0, 1);
    this.physics = physics;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.length = trackLength(track);
    this.lateral = 0; // current racing-line lateral offset (m, + = right of tangent)
    this.targetLateral = (Math.random() - 0.5) * 2;
    this.laneTimer = 0;
    this.lap = 0;
    this.u = 0;
    this.lastU = null;
    this.progress = 0; // laps + u
    this.targetSpeed = 0;
    this.rubber = 1;
    this.grip = (car && car.spec && car.spec.grip) || 1;
    this.maxSpeed = (car && car.spec && car.spec.maxSpeed) || 70;
    this._lastErr = null;
    this._dt = 0;
    this.stepPhysics = true; // set false if the game loop steps physics itself
  }

  /** Lookahead distance in meters (speed dependent). */
  lookahead(speed) { return 8 + Math.abs(speed) * 0.45; }

  /** World target point at arc distance ahead of u, with lateral offset. Writes into out. */
  targetPoint(u, dist, lateral, out) {
    const uu = (((u + dist / this.length) % 1) + 1) % 1;
    out.copy(this.track.pointAt(uu));
    _t.copy(this.track.tangentAt(uu)); _t.y = 0; _t.normalize();
    // right vector of tangent (Y up): right = t x up
    out.x += -_t.z * lateral;
    out.z += _t.x * lateral;
    return out;
  }

  /** Approx curvature (rad/m) between u and u+dist. */
  curvatureAhead(u, dist) {
    _t.copy(this.track.tangentAt(u)); _t.y = 0; _t.normalize();
    const u2 = (((u + dist / this.length) % 1) + 1) % 1;
    _t2.copy(this.track.tangentAt(u2)); _t2.y = 0; _t2.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(_t.dot(_t2), -1, 1));
    return ang / Math.max(dist, 1);
  }

  /**
   * Compute steering for a pose without touching physics (pure helper, used by tests).
   * @returns {number} steer -1..1
   */
  computeSteer(pos, heading, speed) {
    const u = this.track.progressAt(pos);
    // cross-track error vs. desired lateral line (+ = right of tangent); over-aim to cancel understeer drift
    _p.copy(this.track.pointAt(u));
    _t.copy(this.track.tangentAt(u)); _t.y = 0; _t.normalize();
    const side = (pos.x - _p.x) * -_t.z + (pos.z - _p.z) * _t.x;
    const xte = side - this.lateral;
    const aim = this.lateral - THREE.MathUtils.clamp(xte, -6, 6) * 0.9;
    this.targetPoint(u, this.lookahead(speed), aim, _p);
    const desired = headingTo(pos.x, pos.z, _p.x, _p.z);
    const err = wrapAngle(desired - heading);
    // speed-scaled proportional gain + damping on heading-error rate (keeps the controller stable at speed)
    const gain = 2.2 / (1 + Math.abs(speed) / 12);
    const dErr = this._dt > 0 && this._lastErr !== null ? wrapAngle(err - this._lastErr) / this._dt : 0;
    this._lastErr = err;
    const damp = 0.12 * Math.min(1, Math.abs(speed) / 20);
    return THREE.MathUtils.clamp(STEER_SIGN * (err * gain + dErr * damp), -1, 1);
  }

  /**
   * @param {number} dt
   * @param {{playerProgress?:number, others?:Array<{position:Vector3}>, raceStarted?:boolean}} ctx
   */
  update(dt, ctx = {}) {
    const ph = this.physics;
    if (!ph) return this.input;
    const pos = ph.position;
    const speed = ph.speed || 0;
    const u = this.track.progressAt(pos);
    if (this.lastU !== null) {
      if (this.lastU > 0.8 && u < 0.2) this.lap++;
      else if (this.lastU < 0.2 && u > 0.8) this.lap--;
    }
    this.lastU = u;
    this.u = u;
    this.progress = this.lap + u;

    // --- rubber-banding: compare against player progress (in laps)
    let rubber = 1;
    if (typeof ctx.playerProgress === 'number') {
      const gapM = (ctx.playerProgress - this.progress) * this.length; // + = player ahead
      rubber = 1 + THREE.MathUtils.clamp(gapM / 400, -0.12, 0.15);
    }
    this.rubber = rubber;

    // --- overtaking: shift lateral offset if a car is just ahead
    this.laneTimer -= dt;
    const halfW = (this.track.width || 12) * 0.5 - 1.6;
    if (ctx.others && this.laneTimer <= 0) {
      _t.copy(this.track.tangentAt(u)); _t.y = 0; _t.normalize();
      for (const o of ctx.others) {
        if (!o || o === ph || !o.position) continue;
        const dx = o.position.x - pos.x, dz = o.position.z - pos.z;
        const ahead = dx * _t.x + dz * _t.z;
        const side = dx * -_t.z + dz * _t.x;
        if (ahead > 0 && ahead < 14 && Math.abs(side) < 2.2) {
          this.targetLateral = THREE.MathUtils.clamp(side > 0 ? side - 3 : side + 3, -halfW, halfW);
          this.laneTimer = 1.5;
          break;
        }
      }
    }
    if (this.laneTimer < -4) { this.targetLateral *= 0.5; this.laneTimer = 0; }
    this.lateral += (this.targetLateral - this.lateral) * Math.min(1, dt * 1.5);
    this.lateral = THREE.MathUtils.clamp(this.lateral, -halfW, halfW);

    // --- steering
    this._dt = dt;
    const steer = this.computeSteer(pos, ph.heading, speed);

    // --- speed target from curvature ahead
    const brakeDist = 20 + speed * speed / (2 * 9.81 * this.grip);
    const curv = Math.max(this.curvatureAhead(u, 12), this.curvatureAhead(u + 10 / this.length, Math.min(brakeDist, 120)) * 0.85);
    const lateralG = 9.81 * this.grip * (0.5 + 0.25 * this.skill);
    const cornerSpeed = curv > 1e-4 ? Math.sqrt(lateralG / curv) : Infinity;
    const skillSpeed = this.maxSpeed * (0.82 + 0.18 * this.skill) * rubber;
    this.targetSpeed = Math.min(cornerSpeed, skillSpeed);

    const diff = this.targetSpeed - speed;
    const inp = this.input;
    inp.steer = steer;
    if (ctx.raceStarted === false) { inp.throttle = 0; inp.brake = 0; inp.handbrake = true; if (this.stepPhysics && ph.update) ph.update(dt, inp, ctx.track || this.track); return inp; }
    inp.handbrake = false;
    if (diff > 0) {
      inp.throttle = THREE.MathUtils.clamp(diff / 4 + 0.3, 0, 1);
      inp.brake = 0;
    } else {
      inp.throttle = 0;
      inp.brake = THREE.MathUtils.clamp(-diff / 6, 0, 1);
    }
    inp.handbrake = false;
    inp.nitro = this.skill > 0.4 && diff > 8 && Math.abs(steer) < 0.15 && (ph.nitro ?? 0) > 0.2;
    if (this.stepPhysics && ph.update) ph.update(dt, inp, ctx.track || this.track);
    return inp;
  }
}
