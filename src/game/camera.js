import * as THREE from 'three';

// Camera modes: 0 chase, 1 hood, 2 bumper, 3 cinematic
export const CAMERA_MODES = ['chase', 'hood', 'bumper', 'cinematic'];

const _fwd = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _off = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.baseFov = camera.fov || 65;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.smoothHeading = 0;
    this.initialized = false;
    this.shakeTime = 0;
    this.cineAngle = 0;
    this.cineTimer = 0;
    this.stiffness = 60;   // spring k
    this.damping = 14;     // spring c
    this.shakeEnabled = true;
  }

  setMode(i) {
    this.mode = ((i % 4) + 4) % 4;
    this.initialized = false;
    return CAMERA_MODES[this.mode];
  }
  nextMode() { return this.setMode(this.mode + 1); }

  /**
   * @param {number} dt
   * @param {THREE.Object3D|{position}} target car group (position + quaternion) or physics
   * @param {object} physics VehiclePhysics (heading, speed, nitro, drifting)
   */
  update(dt, target, physics) {
    const cam = this.camera;
    const tp = target.position;
    const heading = physics ? physics.heading : 0;
    const speed = physics ? Math.abs(physics.speed) : 0;
    const nitroOn = physics && (physics.nitroActive || physics.boosting);

    // smooth heading (shortest angle)
    let dh = heading - this.smoothHeading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    if (!this.initialized) this.smoothHeading = heading;
    else this.smoothHeading += dh * Math.min(1, dt * (this.mode === 0 ? 5 : 30));
    const h = this.mode === 0 ? this.smoothHeading : heading;
    _fwd.set(-Math.sin(h), 0, -Math.cos(h));

    const q = target.quaternion || (physics && physics.quaternion);
    switch (this.mode) {
      case 0: { // chase
        const dist = 6.5 + speed * 0.03;
        const height = 2.3 + speed * 0.006;
        _desired.copy(tp).addScaledVector(_fwd, -dist); _desired.y += height;
        _look.copy(tp).addScaledVector(_fwd, 4); _look.y += 1.0;
        break;
      }
      case 1: { // hood
        _off.set(0, 1.25, -0.4); if (q) _off.applyQuaternion(q);
        _desired.copy(tp).add(_off);
        _look.copy(_desired).addScaledVector(_fwd, 20); _look.y -= 0.5;
        break;
      }
      case 2: { // bumper
        _off.set(0, 0.55, -2.3); if (q) _off.applyQuaternion(q);
        _desired.copy(tp).add(_off);
        _look.copy(_desired).addScaledVector(_fwd, 20);
        break;
      }
      default: { // cinematic: orbiting/trackside shots that change every few seconds
        this.cineTimer -= dt;
        if (this.cineTimer <= 0) { this.cineTimer = 4 + Math.random() * 3; this.cineAngle = (Math.random() - 0.5) * Math.PI * 1.6; this.initialized = false; }
        this.cineAngle += dt * 0.15;
        const a = h + Math.PI + this.cineAngle;
        _desired.set(tp.x - Math.sin(a) * 9, tp.y + 1.6 + Math.sin(this.cineTimer) * 0.5, tp.z - Math.cos(a) * 9);
        _look.copy(tp); _look.y += 0.8;
      }
    }

    if (!this.initialized) {
      this.pos.copy(_desired); this.vel.set(0, 0, 0); this.lookAt.copy(_look); this.initialized = true;
    } else if (this.mode === 0 || this.mode === 3) {
      // critically-damped-ish spring
      const k = this.mode === 3 ? 12 : this.stiffness, c = this.mode === 3 ? 7 : this.damping;
      const ax = (_desired.x - this.pos.x) * k - this.vel.x * c;
      const ay = (_desired.y - this.pos.y) * k - this.vel.y * c;
      const az = (_desired.z - this.pos.z) * k - this.vel.z * c;
      this.vel.x += ax * dt; this.vel.y += ay * dt; this.vel.z += az * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.lookAt.lerp(_look, Math.min(1, dt * 12));
    } else {
      this.pos.copy(_desired); this.lookAt.copy(_look);
    }

    cam.position.copy(this.pos);

    // shake at high speed / nitro
    this.shakeTime += dt;
    const kmh = speed * 3.6;
    let shake = Math.max(0, (kmh - 180) / 200) * 0.03 + (nitroOn ? 0.035 : 0);
    if (this.mode === 3 || !this.shakeEnabled) shake = 0;
    if (shake > 0) {
      const t = this.shakeTime;
      cam.position.x += Math.sin(t * 47.3) * shake;
      cam.position.y += Math.sin(t * 61.7 + 1.3) * shake;
      cam.position.z += Math.sin(t * 53.1 + 2.1) * shake * 0.5;
    }
    cam.up.copy(_up);
    cam.lookAt(this.lookAt);

    // speed FOV
    const targetFov = this.baseFov + Math.min(22, speed * 0.22) + (nitroOn ? 8 : 0) - (this.mode === 3 ? 15 : 0);
    const nf = cam.fov + (targetFov - cam.fov) * Math.min(1, dt * 4);
    if (Math.abs(nf - cam.fov) > 0.01) { cam.fov = nf; cam.updateProjectionMatrix(); }
  }
}
