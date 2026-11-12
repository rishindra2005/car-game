import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Two builds share one codebase:
//   default  -> WebGL2 renderer (three core)                       -> dist/
//   --mode gpu -> WebGPU renderer; `three` is aliased to the
//                 three/webgpu bundle so only ONE three instance exists -> dist/gpu/
export default defineConfig(({ mode }) => {
  const gpu = mode === 'gpu';
  return {
    base: './',
    publicDir: 'public',
    resolve: gpu ? { alias: [{ find: /^three$/, replacement: fileURLToPath(new URL('./node_modules/three/build/three.webgpu.js', import.meta.url)) }] } : {},
    build: { target: 'es2022', chunkSizeWarningLimit: 2500, outDir: gpu ? 'dist/gpu' : 'dist', emptyOutDir: !gpu, rollupOptions: gpu ? { shimMissingExports: true } : {} },
    server: { host: true },
  };
});
