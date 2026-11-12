import * as THREE from 'three';

/** Quality presets. renderScale is multiplied by the dynamic-resolution factor at runtime. */
export const QUALITY_PRESETS = {
  low:    { name: 'low',    renderScale: 0.75, shadows: false, shadowMapSize: 512,  ssr: false, bloom: false, traffic: 12, drawDistance: 450,  pathTracing: false },
  medium: { name: 'medium', renderScale: 1.0,  shadows: true,  shadowMapSize: 1024, ssr: false, bloom: true,  traffic: 24, drawDistance: 700,  pathTracing: true },
  high:   { name: 'high',   renderScale: 1.0,  shadows: true,  shadowMapSize: 2048, ssr: true,  bloom: true,  traffic: 36, drawDistance: 1000, pathTracing: true },
  ultra:  { name: 'ultra',  renderScale: 1.0,  shadows: true,  shadowMapSize: 4096, ssr: true,  bloom: true,  traffic: 48, drawDistance: 1400, pathTracing: true },
};

/** Target output resolutions (height). 'native' = window size × devicePixelRatio. */
export const RESOLUTIONS = {
  '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '2.5K': [2560, 1440], '2.5k': [2560, 1440], native: null,
};

/**
 * Compute the internal drawing-buffer size for a canvas of cssW×cssH, given a target resolution,
 * user render scale, and dynamic-resolution factor. Pure function (unit-tested).
 */
export function computeRenderSize(cssW, cssH, dpr, resolution, renderScale, dynScale) {
  let w, h;
  const target = RESOLUTIONS[resolution];
  if (target) {
    // Fit target vertical resolution to the canvas aspect ratio.
    h = target[1];
    w = Math.round(h * (cssW / cssH));
  } else {
    w = cssW * dpr; h = cssH * dpr;
  }
  const s = renderScale * dynScale;
  return [Math.max(320, Math.round(w * s)), Math.max(180, Math.round(h * s))];
}

/** Dynamic resolution controller: nudges scale to keep frame time near the target. Pure logic. */
export class DynamicResolution {
  constructor(targetFps = 60, min = 0.55, max = 1.0) {
    this.target = 1000 / targetFps; this.min = min; this.max = max;
    this.scale = 1; this.avg = this.target; this.cooldown = 0; this.enabled = true;
  }
  /** @param ms frame time in milliseconds. Returns true if scale changed. */
  sample(ms) {
    this.avg = this.avg * 0.92 + ms * 0.08;
    if (!this.enabled) return false;
    if (this.cooldown > 0) { this.cooldown--; return false; }
    let next = this.scale;
    if (this.avg > this.target * 1.12) next = Math.max(this.min, this.scale - 0.05);
    else if (this.avg < this.target * 0.8) next = Math.min(this.max, this.scale + 0.025);
    if (next !== this.scale) { this.scale = +next.toFixed(3); this.cooldown = 30; return true; }
    return false;
  }
}

export const IS_GPU_BUILD = typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'gpu';

export class Engine {
  constructor(container, settings = {}) {
    this.container = container;
    this.settings = { preset: 'medium', resolution: 'native', renderScale: 1, renderer: 'auto', dynamicResolution: true, ...settings };
    this.quality = { ...QUALITY_PRESETS[this.settings.preset] };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 3000);
    this.dynres = new DynamicResolution(60);
    this.dynres.enabled = this.settings.dynamicResolution;
    this.updaters = [];
    this.renderFn = null;
    this.fps = 0; this.frame = 0; this.isWebGPU = false;
    this._fpsAcc = 0; this._fpsFrames = 0;
  }

  async init() {
    // The WebGPU renderer lives in the `gpu` build (vite --mode gpu), where `three` is aliased
    // to the three/webgpu bundle. There, WebGPURenderer also provides its own WebGL2 fallback backend.
    if (IS_GPU_BUILD) {
      const r = new THREE['WebGPURenderer']({ antialias: true, powerPreference: 'high-performance', forceWebGL: this.settings.renderer === 'webgl' || /[?&]forcegl/.test(location.search) });
      await r.init();
      this.renderer = r;
      this.isWebGPU = true; // "node renderer" path: no EffectComposer / ShaderMaterial
      this.backend = r.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
    } else {
      this.renderer = new THREE['WebGLRenderer']({ antialias: true, powerPreference: 'high-performance', stencil: false });
      this.backend = 'webgl2';
    }
    const r = this.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = this.quality.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.id = 'game-canvas';
    this.container.prepend(r.domElement);
    addEventListener('resize', () => this.resize());
    this.resize();
    return this;
  }

  setQuality(preset) {
    this.settings.preset = preset;
    Object.assign(this.quality, QUALITY_PRESETS[preset]);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.resize();
  }

  applySettings(s) {
    const presetChanged = s.preset && s.preset !== this.settings.preset;
    Object.assign(this.settings, s);
    this.dynres.enabled = this.settings.dynamicResolution !== false;
    if (presetChanged) this.setQuality(s.preset); else this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const [rw, rh] = computeRenderSize(w, h, devicePixelRatio || 1, this.settings.resolution,
      this.settings.renderScale * this.quality.renderScale, this.dynres.scale);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(rw, rh, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderSize = [rw, rh];
    this.onResize?.(rw, rh);
  }

  onUpdate(fn) { this.updaters.push(fn); return () => { this.updaters = this.updaters.filter(f => f !== fn); }; }

  start() {
    let last = performance.now(), t = 0;
    const loop = (now) => {
      const ms = now - last; last = now;
      const dt = Math.min(ms / 1000, 1 / 30); t += dt;
      for (const fn of this.updaters) fn(dt, t);
      if (this.renderFn) this.renderFn(); else this.renderer.render(this.scene, this.camera);
      this.frame++;
      this._fpsAcc += ms; this._fpsFrames++;
      if (this._fpsAcc > 500) { this.fps = Math.round(this._fpsFrames * 1000 / this._fpsAcc); this._fpsAcc = 0; this._fpsFrames = 0; }
      if (this.frame > 60 && this.dynres.sample(ms)) this.resize();
    };
    this.renderer.setAnimationLoop(loop);
  }
}
