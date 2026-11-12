// Post-processing. WebGL: EffectComposer -> RenderPass -> UnrealBloom (quality.bloom) -> vignette/grade -> OutputPass (ACES + sRGB).
// WebGPU: plain renderer.render (tone mapping still applied by the renderer).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.35 }, uAberration: { value: 0.0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uStrength; uniform float uAberration; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * uAberration * r2;
      vec4 c = texture2D(tDiffuse, vUv);
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.b = texture2D(tDiffuse, vUv - off).b;
      c.rgb *= 1.0 - uStrength * smoothstep(0.1, 0.55, r2 * 1.6);
      gl_FragColor = c;
    }`,
};

export function setupPost(engine) {
  const { renderer, scene, camera } = engine;
  const q = engine.quality || {};
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const photoActive = () => engine.photoMode && engine.photoMode.active;

  if (engine.isWebGPU) {
    return {
      composer: null,
      render() {
        if (photoActive()) return engine.photoMode.update();
        renderer.render(scene, engine.camera || camera);
      },
      setSize() {},
      setSpeedFeel() {},
      dispose() {},
    };
  }

  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.name === 'low' ? 0 : 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  let bloom = null;
  if (q.bloom !== false) {
    const scale = q.name === 'low' ? 0.35 : 0.5; // UnrealBloom builds its own downsampled mip chain
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x * scale, size.y * scale), 0.55, 0.6, 0.85);
    composer.addPass(bloom);
  }
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  return {
    composer, bloom, vignette,
    render() {
      if (photoActive()) return engine.photoMode.update();
      renderPass.camera = engine.camera || camera;
      composer.render();
    },
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
    /** 0..1 speed/nitro feel: slightly stronger vignette + chromatic aberration. */
    setSpeedFeel(k) {
      vignette.uniforms.uStrength.value = 0.35 + 0.25 * k;
      vignette.uniforms.uAberration.value = 0.012 * k;
    },
    dispose() {
      composer.dispose();
      rt.dispose();
      bloom?.dispose();
    },
  };
}
