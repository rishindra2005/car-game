// Velocity Rush — WASM hot path (batched NPC kinematics) with a bit-identical JS fallback.
// State layout: Float32Array, stride 6 per car: [x, z, heading, speed, targetSpeed, steer]
// heading 0 = -Z; forward = (-sin h, -cos h). steer is a front-wheel angle (rad), + = left.

export const STRIDE = 6;
const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

let exportsRef = null;
let memView = null; // cached Float32Array over wasm memory (rebuilt only on grow)
let initPromise = null;

// Must mirror $sin in wasm/physics.wat exactly (same op order, f64).
function psin(x) {
  x = x - TWO_PI * Math.floor((x + PI) / TWO_PI);
  if (x > HALF_PI) x = PI - x;
  if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 - (x2 / 6) * (1 - (x2 / 20) * (1 - (x2 / 42) * (1 - (x2 / 72) * (1 - x2 / 110)))));
}
function pcos(x) { return psin(x + HALF_PI); }

/** Pure JS implementation (identical to the WASM module). Mutates `state` in place. */
export function integrateBatchJS(state, count, dt) {
  for (let i = 0; i < count; i++) {
    const p = i * STRIDE;
    let x = state[p], z = state[p + 1], h = state[p + 2], s = state[p + 3];
    const t = state[p + 4], st = state[p + 5];
    let diff = t - s;
    if (diff > 0) { const lim = 4 * dt; if (diff > lim) diff = lim; }
    else { const lim = -8 * dt; if (diff < lim) diff = lim; }
    s = s + diff;
    h = h + ((s * st) / 2.6) * dt;
    if (h > PI) h = h - TWO_PI;
    if (h < -PI) h = h + TWO_PI;
    x = x - (psin(h) * s) * dt;
    z = z - (pcos(h) * s) * dt;
    state[p] = x; state[p + 1] = z; state[p + 2] = h; state[p + 3] = s;
  }
}

function attach(instance) {
  exportsRef = instance.exports;
  memView = new Float32Array(exportsRef.memory.buffer);
}

/**
 * Load the WASM module. In the browser it fetches `/physics.wasm`.
 * `source` may be a URL string, ArrayBuffer/Uint8Array (bytes) or WebAssembly.Module.
 * Never throws: returns true when WASM is active, false when using the JS fallback.
 */
export function initWasm(source = '/physics.wasm') {
  if (initPromise && typeof source === 'string') return initPromise;
  const p = (async () => {
    try {
      if (typeof WebAssembly === 'undefined') throw new Error('no WebAssembly');
      let instance;
      if (source instanceof WebAssembly.Module) {
        instance = await WebAssembly.instantiate(source, {});
      } else if (typeof source === 'string') {
        const res = await fetch(source);
        if (!res.ok) throw new Error('fetch failed ' + res.status);
        instance = (await WebAssembly.instantiate(await res.arrayBuffer(), {})).instance;
      } else {
        instance = (await WebAssembly.instantiate(source, {})).instance;
      }
      attach(instance);
      return true;
    } catch (e) {
      exportsRef = null; memView = null;
      if (typeof console !== 'undefined') console.warn('[physics] WASM unavailable, using JS fallback:', e && e.message);
      return false;
    }
  })();
  if (typeof source === 'string') initPromise = p;
  return p;
}

export function isWasmActive() { return exportsRef !== null; }

/** Disable WASM (tests / debugging). */
export function disableWasm() { exportsRef = null; memView = null; initPromise = null; }

/** Integrate `count` NPC cars in `state` (Float32Array, stride 6) by dt seconds, in place. */
export function integrateBatch(state, count, dt) {
  if (count <= 0) return;
  if (!exportsRef) { integrateBatchJS(state, count, dt); return; }
  const n = count * STRIDE;
  const mem = exportsRef.memory;
  if (n * 4 > mem.buffer.byteLength) {
    mem.grow(Math.ceil((n * 4 - mem.buffer.byteLength) / 65536));
    memView = new Float32Array(mem.buffer);
  } else if (memView.buffer !== mem.buffer) {
    memView = new Float32Array(mem.buffer);
  }
  for (let i = 0; i < n; i++) memView[i] = state[i];
  exportsRef.integrate(count, dt);
  for (let i = 0; i < n; i++) state[i] = memView[i];
}
