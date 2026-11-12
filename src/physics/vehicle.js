// Velocity Rush — arcade-sim vehicle physics (bicycle model).
// Coordinate system: Y up, meters, car faces local -Z. heading 0 = -Z, positive heading = turn left (CCW from above).
// Forward (x,z) = (-sin h, -cos h); Left (x,z) = (-cos h, sin h).
import { Vector3, Quaternion, Euler } from 'three';

const G = 9.81;
const FIXED_STEP = 1 / 120;
const MAX_SUBSTEPS = 8;
const AIR_DENSITY = 1.225;
const FRONTAL_AREA = 2.2;
const ROLL_RESIST = 0.015;
const WHEEL_RADIUS = 0.34;
const IDLE_RPM = 900;
const REDLINE = 7500;
const SHIFT_TIME = 0.16;
const CG_HEIGHT = 0.5;
const REVERSE_MAX = 12;
const TWO_PI = Math.PI * 2;

const DEFAULT_SPEC = {
  mass: 1350,
  power: 250, // kW
  maxSpeed: 75, // m/s
  grip: 1.1,
  wheelbase: 2.6,
  drag: 0.32, // aerodynamic Cd (frontal area 2.2 m^2 assumed)
  gears: [3.3, 2.2, 1.6, 1.25, 1.0, 0.82],
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export class VehiclePhysics {
  constructor(spec = {}) {
    this.spec = {};
    this.setSpec(spec);

    this._position = new Vector3();
    this.velocity = new Vector3(); // world velocity (authoritative between updates; collision may edit it)
    this.quaternion = new Quaternion();
    this._euler = new Euler(0, 0, 0, 'YXZ');
    this.wheelSpin = [0, 0, 0, 0]; // FL, FR, RL, RR (radians)
    this.wheelSteer = 0; // radians, positive = left
    this.radius = 2.3; // collision circle radius
    this.mass = this.spec.mass;

    this._statePool = {
      x: 0, y: 0, z: 0, heading: 0, speed: 0, speedKmh: 0, rpm: 0, gear: 1,
      nitro: 1, nitroActive: false, drifting: false, driftScore: 0, driftCombo: 0,
      slipAngle: 0, yawRate: 0, roll: 0, pitch: 0, throttle: 0, brake: 0,
      onWall: false, impact: 0, shifting: false,
    };
    this.reset(new Vector3(), 0);
  }

  setSpec(spec) {
    const s = this.spec;
    s.mass = spec.mass ?? DEFAULT_SPEC.mass;
    s.power = spec.power ?? DEFAULT_SPEC.power;
    s.maxSpeed = spec.maxSpeed ?? DEFAULT_SPEC.maxSpeed;
    s.grip = spec.grip ?? DEFAULT_SPEC.grip;
    s.wheelbase = spec.wheelbase ?? DEFAULT_SPEC.wheelbase;
    s.drag = spec.drag ?? DEFAULT_SPEC.drag;
    s.gears = (spec.gears && spec.gears.length) ? spec.gears.slice() : DEFAULT_SPEC.gears.slice();
    s.nitroPower = spec.nitroPower ?? 1.0; // multiplier on boost strength (upgrades)
    s.nitroCapacity = spec.nitroCapacity ?? 1.0; // multiplier on duration
    this.mass = s.mass;
    // final drive so top gear hits redline at maxSpeed
    this._finalDrive = (REDLINE * TWO_PI * WHEEL_RADIUS) / (60 * s.maxSpeed * s.gears[s.gears.length - 1]);
    this._a = s.wheelbase * 0.48; // cg -> front axle
    this._b = s.wheelbase * 0.52; // cg -> rear axle
    this._iz = s.mass * (s.wheelbase * s.wheelbase) * 0.42; // yaw inertia approx
  }

  reset(pos, heading = 0) {
    this._position.copy(pos);
    this._heading = heading;
    this.velocity.set(0, 0, 0);
    this._u = 0; // forward speed (m/s)
    this._v = 0; // lateral speed, + = left
    this._r = 0; // yaw rate, + = left
    this._ax = 0; // longitudinal accel (for weight transfer)
    this._ay = 0;
    this._gearIdx = 0; // 0..n-1; -1 reverse
    this._shiftTimer = 0;
    this._reverseTimer = 0;
    this._rpm = IDLE_RPM;
    this._steerAngle = 0;
    this.roll = 0; // body roll (rad, + = right side up) for visuals
    this.pitch = 0; // body pitch (rad, + = nose up) for visuals
    this._rollVel = 0;
    this._pitchVel = 0;
    this.terrainPitch = 0;
    this.terrainRoll = 0;
    this.nitro = 1;
    this.nitroActive = false;
    this.drifting = false;
    this.driftScore = 0; // total accumulated drift points
    this.driftCombo = 0; // current drift chain points
    this._driftTimer = 0;
    this.onWall = false;
    this.lastImpact = 0; // m/s of normal speed lost on last wall/car hit
    this.throttle = 0;
    this.brake = 0;
    this.slipAngle = 0;
    this.wheelSteer = 0;
    for (let i = 0; i < 4; i++) this.wheelSpin[i] = 0;
    this._updateOrientation();
  }

  get position() { return this._position; }
  get heading() { return this._heading; }
  get speed() { return Math.sqrt(this._u * this._u + this._v * this._v) * (this._u < 0 ? -1 : 1); }
  get forwardSpeed() { return this._u; }
  get rpm() { return this._rpm; }
  /** -1 = reverse, 1..n forward gears */
  get gear() { return this._gearIdx < 0 ? -1 : this._gearIdx + 1; }
  get yawRate() { return this._r; }

  get state() {
    const s = this._statePool;
    s.x = this._position.x; s.y = this._position.y; s.z = this._position.z;
    s.heading = this._heading; s.speed = this.speed; s.speedKmh = Math.abs(s.speed) * 3.6;
    s.rpm = this._rpm; s.gear = this.gear; s.nitro = this.nitro; s.nitroActive = this.nitroActive;
    s.drifting = this.drifting; s.driftScore = this.driftScore; s.driftCombo = this.driftCombo;
    s.slipAngle = this.slipAngle; s.yawRate = this._r; s.roll = this.roll; s.pitch = this.pitch;
    s.throttle = this.throttle; s.brake = this.brake; s.onWall = this.onWall; s.impact = this.lastImpact;
    s.shifting = this._shiftTimer > 0;
    return s;
  }

  /** Called by collision.js after modifying velocity; also resyncs local frame. */
  notifyImpact(amount) { if (amount > this.lastImpact) this.lastImpact = amount; }

  update(dt, input, track) {
    if (!(dt > 0)) return;
    if (dt > 1 / 30) dt = 1 / 30;
    this.lastImpact = 0;
    this.onWall = false;
    this._syncLocalFromWorld();
    let n = Math.ceil(dt / FIXED_STEP - 1e-6);
    if (n > MAX_SUBSTEPS) n = MAX_SUBSTEPS;
    if (n < 1) n = 1;
    const h = dt / n;
    for (let i = 0; i < n; i++) this._step(h, input, track);
    this._updateVisuals(dt, track);
  }

  _syncLocalFromWorld() {
    const sh = Math.sin(this._heading), ch = Math.cos(this._heading);
    const vx = this.velocity.x, vz = this.velocity.z;
    this._u = vx * -sh + vz * -ch;
    this._v = vx * -ch + vz * sh;
  }

  _writeWorldVelocity() {
    const sh = Math.sin(this._heading), ch = Math.cos(this._heading);
    this.velocity.x = -sh * this._u - ch * this._v;
    this.velocity.z = -ch * this._u + sh * this._v;
  }

  _step(h, input, track) {
    const s = this.spec;
    const m = s.mass, L = s.wheelbase, a = this._a, b = this._b;
    const throttle = clamp(input.throttle || 0, 0, 1);
    const brakeIn = clamp(input.brake || 0, 0, 1);
    const steerIn = clamp(input.steer || 0, -1, 1);
    const handbrake = !!input.handbrake;
    let u = this._u, v = this._v, r = this._r;
    const absU = Math.abs(u);

    // ---- steering: speed-sensitive max angle, smoothed (positive input = right -> negative angle)
    const maxSteer = 0.62 / (1 + absU * 0.045);
    const target = -steerIn * maxSteer;
    const rate = 4.0 * h;
    this._steerAngle += clamp(target - this._steerAngle, -rate, rate);
    const delta = this._steerAngle;
    this.wheelSteer = delta;

    // ---- gearbox / reverse logic
    let driveDir = 1;
    let throttleCmd = throttle;
    let brakeCmd = brakeIn;
    if (this._gearIdx < 0) {
      // in reverse: brake pedal drives backwards, throttle brakes then selects 1st
      throttleCmd = brakeIn; brakeCmd = throttle; driveDir = -1;
      if (throttle > 0.1 && u > -0.5) { this._gearIdx = 0; driveDir = 1; throttleCmd = throttle; brakeCmd = 0; }
    } else if (brakeIn > 0.1 && throttle < 0.05 && absU < 0.5) {
      // hold brake at standstill briefly to engage reverse
      this._reverseTimer += h;
      if (this._reverseTimer > 0.35) { this._gearIdx = -1; this._reverseTimer = 0; }
    } else {
      this._reverseTimer = 0;
    }

    const gears = s.gears;
    const nG = gears.length;
    const ratio = this._gearIdx < 0 ? gears[0] : gears[this._gearIdx];
    const wheelOmega = absU / WHEEL_RADIUS;
    let rpm = wheelOmega * ratio * this._finalDrive * 60 / TWO_PI;
    if (rpm < IDLE_RPM) rpm = IDLE_RPM + (this._gearIdx === 0 || this._gearIdx < 0 ? throttleCmd * 2500 * (1 - absU / 8 > 0 ? 1 - absU / 8 : 0) : 0);
    if (rpm > REDLINE * 1.02) rpm = REDLINE * 1.02;

    if (this._shiftTimer > 0) this._shiftTimer -= h;
    else if (this._gearIdx >= 0) {
      if (rpm > REDLINE * 0.93 && this._gearIdx < nG - 1 && throttleCmd > 0.05) {
        this._gearIdx++; this._shiftTimer = SHIFT_TIME;
      } else if (this._gearIdx > 0) {
        const lowerRpm = rpm * gears[this._gearIdx - 1] / gears[this._gearIdx];
        if (rpm < REDLINE * 0.42 && lowerRpm < REDLINE * 0.85) { this._gearIdx--; this._shiftTimer = SHIFT_TIME * 0.6; }
      }
    }
    this._rpm += (rpm - this._rpm) * clamp(h * 20, 0, 1);

    // ---- nitro
    const wantNitro = !!input.nitro && throttleCmd > 0.1 && driveDir > 0 && this.nitro > 0.001;
    this.nitroActive = wantNitro;
    if (wantNitro) this.nitro = Math.max(0, this.nitro - h * 0.22 / s.nitroCapacity);
    else this.nitro = Math.min(1, this.nitro + h * 0.035);

    // ---- vertical loads with weight transfer
    const Wt = m * G;
    let fzF = Wt * b / L - m * this._ax * CG_HEIGHT / L;
    let fzR = Wt * a / L + m * this._ax * CG_HEIGHT / L;
    fzF = clamp(fzF, Wt * 0.15, Wt * 0.85);
    fzR = clamp(fzR, Wt * 0.15, Wt * 0.85);

    const mu = s.grip;
    const muR = handbrake ? mu * 0.42 : mu;
    const muF = mu;

    // ---- longitudinal drive force (rear-wheel drive)
    const vmax = driveDir > 0 ? s.maxSpeed * (wantNitro ? 1.08 : 1.0) : REVERSE_MAX;
    let Fx = 0;
    if (this._shiftTimer <= 0 && throttleCmd > 0) {
      const rn = this._rpm / REDLINE;
      const curve = clamp(0.62 + 0.9 * rn - 0.55 * rn * rn, 0.4, 1.0); // simple torque/power shape
      const P = s.power * 1000 * (wantNitro ? 1.0 + 0.55 * s.nitroPower : 1.0);
      let F = P * curve * throttleCmd / Math.max(absU, 6);
      const limiter = clamp((vmax - absU * (driveDir * u >= 0 ? 1 : -1)) / (0.025 * vmax + 0.5), 0, 1);
      F *= limiter;
      Fx = F * driveDir;
    }
    // traction limit for drive on rear axle
    const tractMax = muR * fzR;
    if (Fx > tractMax) Fx = tractMax; else if (Fx < -tractMax) Fx = -tractMax;

    // brakes (all wheels) + handbrake (rear)
    let Fb = brakeCmd * mu * Wt * 0.95 + (handbrake ? muR * fzR * 0.6 : 0);
    // resistances
    const Fdrag = 0.5 * AIR_DENSITY * s.drag * FRONTAL_AREA * u * absU;
    const Froll = ROLL_RESIST * Wt * (absU > 0.3 ? Math.sign(u) : u / 0.3);

    // ---- lateral tire forces (slip angles)
    let Ffy, Fry;
    const lowSpeed = absU < 2.5;
    if (!lowSpeed) {
      const signU = u >= 0 ? 1 : -1;
      const alphaF = Math.atan2(v + a * r, absU) - delta * signU;
      const alphaR = Math.atan2(v - b * r, absU);
      const cF = 9.0 * fzF, cR = 9.5 * fzR;
      // rear friction circle: lateral capacity shrinks with longitudinal usage
      const usedR = Math.min(Math.abs(Fx) / (muR * fzR + 1e-6), 0.95);
      const latMaxR = muR * fzR * Math.sqrt(1 - usedR * usedR);
      Ffy = clamp(-cF * alphaF, -muF * fzF, muF * fzF);
      Fry = clamp(-cR * alphaR, -latMaxR, latMaxR);
    } else {
      Ffy = 0; Fry = 0;
    }

    // ---- integrate
    let du = (Fx - Fdrag - Froll - Ffy * Math.sin(delta)) / m + v * r;
    // brake opposes motion without reversing it
    const brakeDv = Fb / m * h;
    let un = u + du * h;
    if (un > 0) un = Math.max(0, un - brakeDv); else if (un < 0) un = Math.min(0, un + brakeDv);
    if (Math.abs(un) < 0.05 && throttleCmd < 0.01) un = 0;

    let vn, rn2;
    if (!lowSpeed) {
      const dv = (Fry + Ffy * Math.cos(delta)) / m - u * r;
      const dr = (a * Ffy * Math.cos(delta) - b * Fry) / this._iz;
      vn = v + dv * h;
      rn2 = r + dr * h;
      // arcade stability: yaw damping that weakens when drifting with handbrake
      const damp = handbrake ? 0.4 : 1.6;
      rn2 -= rn2 * clamp(damp * h, 0, 1) * 0.5;
      // gentle lateral scrub when not sliding hard
      vn -= vn * clamp(0.8 * h, 0, 1);
    } else {
      // kinematic bicycle at low speed
      const rKin = un * Math.tan(delta) / L;
      rn2 = r + (rKin - r) * clamp(h * 12, 0, 1);
      vn = v * (1 - clamp(h * 10, 0, 1));
    }
    // blend toward kinematic in 2.5..5 m/s band to avoid jitter
    if (absU >= 2.5 && absU < 5) {
      const t = (absU - 2.5) / 2.5;
      const rKin = un * Math.tan(delta) / L;
      rn2 = rn2 * t + rKin * (1 - t);
    }

    this._ax = clamp((un - u) / h, -G * 1.6, G * 1.6);
    this._ay = clamp(un * rn2, -G * 1.6, G * 1.6);
    this._u = un; this._v = vn; this._r = rn2;

    // heading + position
    this._heading += rn2 * h;
    if (this._heading > Math.PI) this._heading -= TWO_PI;
    else if (this._heading < -Math.PI) this._heading += TWO_PI;
    this._writeWorldVelocity();
    const p = this._position;
    p.x += this.velocity.x * h;
    p.z += this.velocity.z * h;

    // ---- walls
    if (track && track.constrain) {
      const res = track.constrain(p, this.velocity);
      if (res && res.hit && res.normal) {
        const nx = res.normal.x, nz = res.normal.z;
        const nl = Math.sqrt(nx * nx + nz * nz) || 1;
        const ux = nx / nl, uz = nz / nl;
        const vnorm = this.velocity.x * ux + this.velocity.z * uz;
        const before = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
        if (vnorm < 0) {
          this.velocity.x -= ux * vnorm * 1.25; // small bounce
          this.velocity.z -= uz * vnorm * 1.25;
        }
        // speed loss proportional to impact angle
        const impact = before > 0.01 ? Math.abs(vnorm) / before : 0;
        const keep = 1 - (0.05 + 0.45 * impact);
        this.velocity.x *= keep; this.velocity.z *= keep;
        this.onWall = true;
        if (Math.abs(vnorm) > this.lastImpact) this.lastImpact = Math.abs(vnorm);
        this._r *= 0.6;
        this._syncLocalFromWorld();
      }
    }

    // ---- terrain height
    p.y = track && track.heightAt ? track.heightAt(p.x, p.z) : 0;

    // ---- slip / drift scoring
    const sp = Math.sqrt(this._u * this._u + this._v * this._v);
    this.slipAngle = sp > 1 ? Math.atan2(this._v, Math.abs(this._u)) : 0;
    const absSlip = Math.abs(this.slipAngle);
    const isDrift = sp > 9 && absSlip > 0.14 && this._u > 0;
    if (isDrift) {
      this._driftTimer = 0.4;
      const pts = sp * Math.min(absSlip, 0.9) * 12 * h;
      this.driftCombo += pts;
      this.nitro = Math.min(1, this.nitro + h * 0.06 * Math.min(absSlip * 3, 1));
    } else if (this._driftTimer > 0) {
      this._driftTimer -= h;
      if (this._driftTimer <= 0) { this.driftScore += this.driftCombo; this.driftCombo = 0; }
    }
    if (this.onWall && this.driftCombo > 0) this.driftCombo = 0; // hitting a wall cancels the chain
    this.drifting = isDrift;

    // wheel spin
    const dSpin = this._u / WHEEL_RADIUS * h;
    const rearSpin = dSpin + (throttleCmd > 0.5 && absU < 8 && this._gearIdx === 0 ? 0.6 * throttleCmd * driveDir : 0) + (handbrake ? -dSpin : 0);
    this.wheelSpin[0] = (this.wheelSpin[0] + dSpin) % TWO_PI;
    this.wheelSpin[1] = (this.wheelSpin[1] + dSpin) % TWO_PI;
    this.wheelSpin[2] = (this.wheelSpin[2] + rearSpin) % TWO_PI;
    this.wheelSpin[3] = (this.wheelSpin[3] + rearSpin) % TWO_PI;

    this.throttle = throttleCmd;
    this.brake = brakeCmd;
  }

  /** Total drift points including the active chain. */
  get totalDrift() { return this.driftScore + this.driftCombo; }

  _updateVisuals(dt, track) {
    // terrain slope
    const p = this._position;
    if (track && track.heightAt) {
      const sh = Math.sin(this._heading), ch = Math.cos(this._heading);
      const hl = this.spec.wheelbase * 0.5;
      const fx = -sh * hl, fz = -ch * hl; // forward offset
      const lx = -ch * 0.8, lz = sh * 0.8; // left offset
      const hF = track.heightAt(p.x + fx, p.z + fz), hB = track.heightAt(p.x - fx, p.z - fz);
      const hL = track.heightAt(p.x + lx, p.z + lz), hR = track.heightAt(p.x - lx, p.z - lz);
      this.terrainPitch = Math.atan2(hF - hB, hl * 2);
      this.terrainRoll = Math.atan2(hR - hL, 1.6);
    } else { this.terrainPitch = 0; this.terrainRoll = 0; }

    // body pitch/roll spring-damper driven by accelerations
    const targetPitch = clamp(this._ax * 0.006, -0.07, 0.07); // accel -> nose up (squat)
    const targetRoll = clamp(this._ay * 0.007, -0.09, 0.09); // turning left -> right side down? (body leans outward)
    const k = 90, c = 14;
    const step = Math.min(dt, 1 / 30);
    this._pitchVel += ((targetPitch - this.pitch) * k - this._pitchVel * c) * step;
    this.pitch += this._pitchVel * step;
    this._rollVel += ((-targetRoll - this.roll) * k - this._rollVel * c) * step;
    this.roll += this._rollVel * step;

    this._updateOrientation();
  }

  _updateOrientation() {
    this._euler.set(this.terrainPitch, this._heading, this.terrainRoll, 'YXZ');
    this.quaternion.setFromEuler(this._euler);
  }
}

export const PHYSICS_FIXED_STEP = FIXED_STEP;
