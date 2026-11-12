// Compiles wasm/physics.wat -> public/physics.wasm using the `wabt` npm package.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import wabtInit from 'wabt';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'wasm/physics.wat');
const out = resolve(root, 'public/physics.wasm');

const wabt = await wabtInit();
const mod = wabt.parseWat('physics.wat', readFileSync(src, 'utf8'));
mod.validate();
const { buffer } = mod.toBinary({ log: false });
mod.destroy();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(buffer));
console.log(`[build-wasm] wrote ${out} (${buffer.length} bytes)`);
