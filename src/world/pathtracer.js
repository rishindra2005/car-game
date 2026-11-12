// Photo Mode — progressive stochastic accumulation ("path-traced look", honestly NOT a full path tracer).
// Each frame renders the live scene once with:
//   * sub-pixel camera jitter            -> anti-aliasing
//   * sun position jittered over a disc   -> soft area-light shadows (penumbrae)
//   * lens jitter around a focus point    -> physically-based depth of field (thin lens)
// and averages the HDR result into a float accumulation buffer (running mean), then tone-maps it to screen.
// After `maxSamples` the image converges and rendering stops costing GPU time (just a blit).
// WebGL only. On WebGPU it is a no-op that logs a notice. Must be OFF during gameplay (toggle with P).
import * as THREE from 'three';

const ACCUM_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const ACCUM_FS = /* glsl */ `
  uniform sampler2D tSample; uniform sampler2D tPrev; uniform float uWeight; varying vec2 vUv;
  void main(){ gl_FragColor = mix(texture2D(tPrev, vUv), texture2D(tSample, vUv), uWeight); }`;
const SHOW_FS = /* glsl */ `
  uniform sampler2D tAccum; uniform float uVignette; varying vec2 vUv;
  void main(){
    vec4 c = texture2D(tAccum, vUv);
    vec2 d = vUv - 0.5; c.rgb *= 1.0 - uVignette * dot(d, d) * 1.6;
    gl_FragColor = vec4(c.rgb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// low-discrepancy sequence for well-distributed samples
function halton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

export class PhotoMode {
  constructor(engine) {
    this.engine = engine;
    this.maxSamples = 256;
    this.aperture = 0.06; // lens radius (m) — 0 disables DOF
    this.focusDistance = null; // null = auto (distance to camera target / 8 m)
    this.sunSoftness = 1.6; // jitter radius (m-ish at 250 m distance -> ~0.4°)
    this.samples = 0;
    this._active = false;
    this.supported = !engine.isWebGPU;
    this._lastCam = new THREE.Matrix4();
    this._basePos = new THREE.Vector3();
    this._baseQuat = new THREE.Quaternion();
    this._sunBase = new THREE.Vector3();
    this._sun = null;
    this._v = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._f = new THREE.Vector3();
    this.onChange = null;
  }

  get active() { return this._active; }

  toggle(force) {
    const want = force === undefined ? !this._active : !!force;
    if (want && !this.supported) {
      console.info('[PhotoMode] Photo mode needs the WebGL renderer; unavailable on WebGPU.');
      return false;
    }
    if (want === this._active) return this._active;
    this._active = want;
    if (want) this._begin(); else this._end();
    this.onChange?.(want);
    return want;
  }

  _ensureTargets() {
    const r = this.engine.renderer, s = r.getDrawingBufferSize(new THREE.Vector2());
    if (this._rtA && this._rtA.width === s.x && this._rtA.height === s.y) return;
    this._disposeTargets();
    const opts = { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false };
    this._rtSample = new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, depthBuffer: true });
    this._rtA = new THREE.WebGLRenderTarget(s.x, s.y, opts);
    this._rtB = new THREE.WebGLRenderTarget(s.x, s.y, opts);
    if (!this._quad) {
      const geo = new THREE.PlaneGeometry(2, 2);
      this._accumMat = new THREE.ShaderMaterial({
        uniforms: { tSample: { value: null }, tPrev: { value: null }, uWeight: { value: 1 } },
        vertexShader: ACCUM_VS, fragmentShader: ACCUM_FS, depthTest: false, depthWrite: false, toneMapped: false,
      });
      this._showMat = new THREE.ShaderMaterial({
        uniforms: { tAccum: { value: null }, uVignette: { value: 0.3 } },
        vertexShader: ACCUM_VS, fragmentShader: SHOW_FS, depthTest: false, depthWrite: false,
      });
      this._quad = new THREE.Mesh(geo, this._accumMat);
      this._quad.frustumCulled = false;
      this._quadScene = new THREE.Scene();
      this._quadScene.add(this._quad);
      this._quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
  }

  _disposeTargets() {
    this._rtSample?.dispose(); this._rtA?.dispose(); this._rtB?.dispose();
    this._rtSample = this._rtA = this._rtB = null;
  }

  _begin() {
    const { scene, camera } = this.engine;
    this._ensureTargets();
    this._sun = null;
    scene.traverse((o) => { if (!this._sun && o.isDirectionalLight && o.castShadow) this._sun = o; });
    this.reset();
    camera.updateMatrixWorld();
    this._lastCam.copy(camera.matrixWorld);
  }

  _end() {
    const cam = this.engine.camera;
    cam.clearViewOffset?.();
    this._restoreCamera();
    this._disposeTargets();
  }

  reset() { this.samples = 0; }

  _restoreCamera() {
    if (!this._camSaved) return;
    const cam = this.engine.camera;
    cam.position.copy(this._basePos); cam.quaternion.copy(this._baseQuat);
    cam.updateMatrixWorld();
    if (this._sun) this._sun.position.copy(this._sunBase);
    this._camSaved = false;
  }

  /** Call once per frame while active (instead of the normal render). Renders + displays one more sample. */
  update() {
    if (!this._active) return;
    const { renderer, scene, camera } = this.engine;
    this._ensureTargets();
    // restart accumulation if the user / chase camera moved the camera
    camera.updateMatrixWorld();
    const e1 = camera.matrixWorld.elements, e0 = this._lastCam.elements;
    let moved = false;
    for (let i = 0; i < 16; i++) if (Math.abs(e1[i] - e0[i]) > 1e-4) { moved = true; break; }
    if (moved) { this.reset(); this._lastCam.copy(camera.matrixWorld); }

    if (this.samples < this.maxSamples) {
      const k = this.samples + 1;
      const w = this._rtA.width, h = this._rtA.height;
      // save
      this._basePos.copy(camera.position); this._baseQuat.copy(camera.quaternion);
      if (this._sun) this._sunBase.copy(this._sun.position);
      this._camSaved = true;
      // 1) sub-pixel jitter
      const jx = halton(k, 2) - 0.5, jy = halton(k, 3) - 0.5;
      if (camera.isPerspectiveCamera) camera.setViewOffset(w, h, jx, jy, w, h);
      // 2) thin-lens DOF: move eye on aperture disc, keep focus plane fixed
      if (this.aperture > 0 && camera.isPerspectiveCamera) {
        const fd = this.focusDistance ?? 8;
        const ang = halton(k, 5) * Math.PI * 2, rad = Math.sqrt(halton(k, 7)) * this.aperture;
        this._r.set(1, 0, 0).applyQuaternion(this._baseQuat);
        this._u.set(0, 1, 0).applyQuaternion(this._baseQuat);
        this._f.set(0, 0, -1).applyQuaternion(this._baseQuat);
        const focus = this._v.copy(this._basePos).addScaledVector(this._f, fd);
        camera.position.copy(this._basePos).addScaledVector(this._r, Math.cos(ang) * rad).addScaledVector(this._u, Math.sin(ang) * rad);
        camera.lookAt(focus);
      }
      camera.updateMatrixWorld();
      // 3) area-light soft shadows
      if (this._sun) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.sunSoftness * 4;
        this._sun.position.x += Math.cos(a) * r;
        this._sun.position.z += Math.sin(a) * r;
        this._sun.position.y += (Math.random() - 0.5) * r;
        if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
      }
      // render HDR sample (linear, no tone mapping when rendering into a target)
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this._rtSample);
      renderer.render(scene, camera);
      // running mean: accum = mix(prev, sample, 1/k)
      this._accumMat.uniforms.tSample.value = this._rtSample.texture;
      this._accumMat.uniforms.tPrev.value = this._rtA.texture;
      this._accumMat.uniforms.uWeight.value = 1 / k;
      this._quad.material = this._accumMat;
      renderer.setRenderTarget(this._rtB);
      renderer.render(this._quadScene, this._quadCam);
      renderer.setRenderTarget(prevTarget);
      const t = this._rtA; this._rtA = this._rtB; this._rtB = t;
      this.samples = k;
      // restore
      camera.clearViewOffset();
      this._restoreCamera();
      this._lastCam.copy(camera.matrixWorld);
    }
    // display (ACES + sRGB via the renderer's tone mapping on the screen pass)
    this._showMat.uniforms.tAccum.value = this._rtA.texture;
    this._quad.material = this._showMat;
    renderer.setRenderTarget(null);
    renderer.render(this._quadScene, this._quadCam);
  }

  /** 0..1 convergence for UI ("Photo mode — 128/256 samples"). */
  get progress() { return this.samples / this.maxSamples; }

  dispose() {
    this.toggle(false);
    this._disposeTargets();
    this._quad?.geometry.dispose(); this._accumMat?.dispose(); this._showMat?.dispose();
  }
}
