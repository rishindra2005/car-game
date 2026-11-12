#!/usr/bin/env node
// Velocity Rush end-to-end smoke test (Playwright + headless Chromium).
//
// Usage:
//   npm run build && node tests/e2e/smoke.mjs        # serves dist/ via `vite preview` on :4173
//   E2E_URL=http://localhost:5173 node tests/e2e/smoke.mjs   # test an already running server
//
// Exits non-zero on page errors, failed readiness, or if the player car does not accelerate.
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SCREENSHOT = path.join(__dirname, 'screenshot.png');
const PORT = 4173;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const require = createRequire(import.meta.url);
    try {
      return require('playwright');
    } catch {
      // Fall back to the globally installed package.
      const globalRoot = execSync('npm root -g').toString().trim();
      return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error(`Server at ${url} did not come up within ${timeoutMs} ms`);
}

let server = null;
let browser = null;
let failures = [];

function fail(msg) {
  failures.push(msg);
  console.error(`FAIL: ${msg}`);
}

async function main() {
  const { chromium } = await loadPlaywright();

  let url = process.env.E2E_URL;
  if (!url) {
    url = `http://localhost:${PORT}/`;
    server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    server.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(`[vite] ${d}`));
    server.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  }
  await waitForServer(url);
  console.log(`Testing ${url}`);

  browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err && err.stack ? err.stack : err)));

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  // 1. Wait for the engine to report readiness.
  try {
    await page.waitForFunction(() => window.__VR_READY === true, null, { timeout: 60000 });
    console.log('OK: window.__VR_READY');
  } catch {
    fail('window.__VR_READY never became true (60 s)');
  }

  const hasHooks = await page.evaluate(() => !!(window.__VR_TEST && window.__VR_TEST.startQuickRace));
  if (!hasHooks) {
    fail('window.__VR_TEST.startQuickRace is not exposed');
  } else {
    // 2. Start a quick race and let it run.
    await page.evaluate(() => window.__VR_TEST.startQuickRace());
    await sleep(4500);
    const before = await page.evaluate(() => window.__VR_TEST.stats());
    console.log('Stats after 3 s:', JSON.stringify(before));

    // 3. Hold throttle and verify the car moves.
    await page.keyboard.down('ArrowUp');
    await sleep(4000);
    const during = await page.evaluate(() => window.__VR_TEST.stats());
    await page.keyboard.up('ArrowUp');
    console.log('Stats after 2 s throttle:', JSON.stringify(during));
    if (!(during && during.playerSpeed > 0)) {
      fail(`playerSpeed did not increase under throttle (got ${during && during.playerSpeed})`);
    } else {
      console.log(`OK: playerSpeed = ${Number(during.playerSpeed).toFixed(2)}`);
    }
    if (during && during.frame <= (before ? before.frame : 0)) {
      fail('frame counter is not advancing (render loop stalled?)');
    }
  }

  await page.screenshot({ path: SCREENSHOT });
  console.log(`Screenshot: ${path.relative(ROOT, SCREENSHOT)}`);

  if (consoleErrors.length) {
    console.warn(`Console errors (${consoleErrors.length}, informational):`);
    for (const e of consoleErrors.slice(0, 20)) console.warn(`  - ${e}`);
  }
  if (pageErrors.length) {
    for (const e of pageErrors) console.error(`  page error: ${e}`);
    fail(`${pageErrors.length} uncaught page error(s)`);
  }
}

async function cleanup() {
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  if (server && server.exitCode === null) {
    try {
      if (process.platform !== 'win32') process.kill(-server.pid, 'SIGTERM');
      else server.kill();
    } catch { try { server.kill(); } catch { /* ignore */ } }
  }
}

main()
  .catch((err) => fail(err && err.stack ? err.stack : String(err)))
  .finally(async () => {
    await cleanup();
    if (failures.length) {
      console.error(`\nSmoke test FAILED (${failures.length} problem(s)).`);
      process.exit(1);
    }
    console.log('\nSmoke test PASSED.');
    process.exit(0);
  });
