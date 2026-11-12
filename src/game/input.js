// Keyboard + Gamepad input. state matches physics input shape.
const KEYMAP = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  nitro: ['ShiftLeft', 'ShiftRight']
};
const ACTIONS = { KeyC: 'camera', KeyP: 'photo', Escape: 'pause', KeyR: 'reset', KeyM: 'map' };

export class Input {
  constructor(target = (typeof window !== 'undefined' ? window : null)) {
    this.target = target;
    this.keys = new Set();
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.steerSmooth = 0;
    this.actions = {};          // name -> callback
    this.pressed = new Set();   // one-shot actions since last update
    this.framePressed = new Set();
    this.usingGamepad = false;
    this.enabled = true;
    this._gpPrev = {};
    this._down = (e) => this._onKey(e, true);
    this._up = (e) => this._onKey(e, false);
    this._blur = () => this.keys.clear();
    if (target && target.addEventListener) {
      target.addEventListener('keydown', this._down);
      target.addEventListener('keyup', this._up);
      target.addEventListener('blur', this._blur);
    }
  }

  /** Register a callback for a discrete action ('camera','photo','pause','reset','map'). */
  on(action, fn) { this.actions[action] = fn; return this; }

  _code(e) {
    if (e.code) return e.code;
    const k = (e.key || '').toLowerCase();
    const m = { w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', c: 'KeyC', p: 'KeyP', r: 'KeyR', m: 'KeyM', ' ': 'Space', shift: 'ShiftLeft', escape: 'Escape',
      arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight' };
    return m[k] || e.key;
  }

  _onKey(e, down) {
    const code = this._code(e);
    if (down) {
      if (!this.keys.has(code) && ACTIONS[code]) this._fire(ACTIONS[code]);
      this.keys.add(code);
      if (code === 'Space' || code.startsWith('Arrow')) { if (e.preventDefault) e.preventDefault(); }
    } else this.keys.delete(code);
    this.usingGamepad = false;
  }

  _fire(name) {
    this.pressed.add(name);
    if (this.actions[name]) this.actions[name]();
  }

  _any(list) { for (const k of list) if (this.keys.has(k)) return true; return false; }

  /** Call once per frame. dt optional (for steering smoothing on keyboard). */
  update(dt = 1 / 60) {
    // swap buffers: actions fired since last update become this frame's actions
    const tmp = this.framePressed; this.framePressed = this.pressed; this.pressed = tmp; this.pressed.clear();
    const s = this.state;
    let throttle = this._any(KEYMAP.throttle) ? 1 : 0;
    let brake = this._any(KEYMAP.brake) ? 1 : 0;
    let steerT = (this._any(KEYMAP.right) ? 1 : 0) - (this._any(KEYMAP.left) ? 1 : 0);
    let handbrake = this._any(KEYMAP.handbrake);
    let nitro = this._any(KEYMAP.nitro);

    // keyboard steering ramps for smoothness
    const rate = steerT === 0 ? 8 : 5;
    const diff = steerT - this.steerSmooth;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
    this.steerSmooth += step;
    let steer = this.steerSmooth;

    const gp = this._pollGamepad();
    if (gp) {
      if (gp.throttle > 0.05) throttle = Math.max(throttle, gp.throttle);
      if (gp.brake > 0.05) brake = Math.max(brake, gp.brake);
      if (Math.abs(gp.steer) > 0.12) { steer = gp.steer; this.usingGamepad = true; }
      handbrake = handbrake || gp.handbrake;
      nitro = nitro || gp.nitro;
    }
    if (!this.enabled) { throttle = 0; brake = 0; steer = 0; handbrake = false; nitro = false; }
    s.throttle = throttle; s.brake = brake; s.steer = Math.max(-1, Math.min(1, steer));
    s.handbrake = handbrake; s.nitro = nitro;
    return s;
  }

  _pollGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) { return null; }
    const gp = pads && Array.from(pads).find(p => p && p.connected);
    if (!gp) return null;
    const b = (i) => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
    const ax = gp.axes[0] || 0;
    const steer = Math.sign(ax) * Math.max(0, (Math.abs(ax) - 0.1) / 0.9);
    // standard mapping: RT=7, LT=6, A=0, B=1, X=2, Y=3, Start=9, Back=8
    const out = { throttle: b(7), brake: b(6), steer, handbrake: b(2) > 0.5 || b(5) > 0.5, nitro: b(0) > 0.5 || b(4) > 0.5 };
    const edge = { 3: 'camera', 9: 'pause', 8: 'photo', 1: 'reset' };
    for (const i in edge) {
      const now = b(+i) > 0.5;
      if (now && !this._gpPrev[i]) this._fire(edge[i]);
      this._gpPrev[i] = now;
    }
    return out;
  }

  wasPressed(action) { return this.framePressed.has(action) || this.pressed.has(action); }

  dispose() {
    const t = this.target;
    if (t && t.removeEventListener) {
      t.removeEventListener('keydown', this._down);
      t.removeEventListener('keyup', this._up);
      t.removeEventListener('blur', this._blur);
    }
  }
}
