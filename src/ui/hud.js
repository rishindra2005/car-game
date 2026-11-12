// In-race HUD: speedometer, tach, gear, nitro bar, position/lap/time, heat meter,
// countdown, wrong-way banner, drift score, minimap canvas.

export function formatTime(t) {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
}

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export class HUD {
  constructor(root) {
    this.root = root;
    this.el = el('div', 'vr-hud hidden', root);
    this._cache = {};
    // top-left: position / lap
    const tl = el('div', 'hud-panel hud-tl', this.el);
    this.posEl = el('div', 'hud-pos', tl, '1<small>/8</small>');
    this.lapEl = el('div', 'hud-lap', tl, 'LAP 1/3');
    // top-right: times
    const tr = el('div', 'hud-panel hud-tr', this.el);
    el('div', 'hud-label', tr, 'TIME');
    this.timeEl = el('div', 'hud-time', tr, '0:00.000');
    el('div', 'hud-label', tr, 'LAP / BEST');
    this.lapTimeEl = el('div', 'hud-sub', tr, '');
    this.modeEl = el('div', 'hud-mode', tr, '');
    // center
    this.countEl = el('div', 'hud-countdown', this.el, '');
    this.wrongEl = el('div', 'hud-wrongway hidden', this.el, 'WRONG WAY');
    this.msgEl = el('div', 'hud-message', this.el, '');
    this.driftEl = el('div', 'hud-drift hidden', this.el, '');
    // heat meter
    this.heatWrap = el('div', 'hud-heat hidden', this.el);
    el('span', 'hud-label', this.heatWrap, 'HEAT');
    this.heatPips = [];
    for (let i = 0; i < 5; i++) this.heatPips.push(el('i', 'pip', this.heatWrap));
    // bottom-right: speedo
    const br = el('div', 'hud-speedo', this.el);
    this.tachCanvas = el('canvas', 'hud-tach', br);
    this.tachCanvas.width = 240; this.tachCanvas.height = 240;
    this.tachCtx = this.tachCanvas.getContext('2d');
    this.speedEl = el('div', 'hud-speed', br, '0');
    el('div', 'hud-unit', br, 'KM/H');
    this.gearEl = el('div', 'hud-gear', br, 'N');
    const nb = el('div', 'hud-nitro', br);
    this.nitroFill = el('div', 'hud-nitro-fill', nb);
    el('span', 'hud-nitro-label', nb, 'NITRO');
    // bottom-left: minimap
    const bl = el('div', 'hud-minimap', this.el);
    this.mapCanvas = el('canvas', '', bl);
    this.mapCanvas.width = 220; this.mapCanvas.height = 220;
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.mapPts = null;
    this._lastTach = -1;
  }

  _set(key, node, val, html = false) {
    if (this._cache[key] === val) return;
    this._cache[key] = val;
    if (html) node.innerHTML = val; else node.textContent = val;
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  /** Provide the track for the minimap (uses track.spline points). */
  setTrack(track) {
    let pts = [];
    if (track && track.spline && track.spline.getSpacedPoints) pts = track.spline.getSpacedPoints(160).map(p => [p.x, p.z]);
    else if (track && track.controlPoints) pts = track.controlPoints.map(p => [p[0], p[1]]);
    if (!pts.length) { this.mapPts = null; return; }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const size = Math.max(maxX - minX, maxZ - minZ) || 1;
    const pad = 18, W = this.mapCanvas.width - pad * 2;
    const s = W / size;
    const ox = pad + (W - (maxX - minX) * s) / 2, oz = pad + (W - (maxZ - minZ) * s) / 2;
    this.mapXf = { s, ox, oz, minX, minZ };
    this.mapPts = pts.map(([x, z]) => [ox + (x - minX) * s, oz + (z - minZ) * s]);
    // pre-render track to offscreen
    const off = document.createElement('canvas');
    off.width = this.mapCanvas.width; off.height = this.mapCanvas.height;
    const c = off.getContext('2d');
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); this.mapPts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 8; c.stroke();
    c.strokeStyle = 'rgba(200,203,207,0.9)'; c.lineWidth = 4; c.stroke();
    const [sx, sy] = this.mapPts[0];
    c.fillStyle = '#f2efe9'; c.fillRect(sx - 5, sy - 2, 10, 4);
    this.mapBg = off;
  }

  _drawMap(player, others, police) {
    const c = this.mapCtx, cv = this.mapCanvas;
    c.clearRect(0, 0, cv.width, cv.height);
    if (!this.mapBg) return;
    c.drawImage(this.mapBg, 0, 0);
    const xf = this.mapXf;
    const P = (x, z) => [xf.ox + (x - xf.minX) * xf.s, xf.oz + (z - xf.minZ) * xf.s];
    if (others) {
      c.fillStyle = '#f5b83d';
      for (const o of others) { const [x, y] = P(o.x, o.z); c.beginPath(); c.arc(x, y, 4, 0, 6.283); c.fill(); }
    }
    if (police) {
      const blink = (performance.now() / 200 | 0) % 2;
      c.fillStyle = blink ? '#d9412e' : '#3b6fd9';
      for (const o of police) { const [x, y] = P(o.x, o.z); c.beginPath(); c.arc(x, y, 4, 0, 6.283); c.fill(); }
    }
    if (player) {
      const [x, y] = P(player.x, player.z);
      const h = player.heading || 0;
      c.save(); c.translate(x, y); c.rotate(-h);
      c.fillStyle = '#ffffff'; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, -8); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  }

  // Analog dial: white ticks + needle, red redline arc.
  _drawTach(rpmNorm, redline = 0.85) {
    const q = Math.round(rpmNorm * 200);
    if (q === this._lastTach) return;
    this._lastTach = q;
    const c = this.tachCtx, W = 240, cx = 120, cy = 120, r = 108;
    c.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, span = a1 - a0;
    c.lineCap = 'butt';
    c.lineWidth = 2; c.strokeStyle = 'rgba(242,239,233,0.35)';
    c.beginPath(); c.arc(cx, cy, r, a0, a0 + span * redline); c.stroke();
    c.lineWidth = 6; c.strokeStyle = '#d9412e';
    c.beginPath(); c.arc(cx, cy, r - 2, a0 + span * redline, a1); c.stroke();
    // ticks
    for (let i = 0; i <= 32; i++) {
      const major = i % 4 === 0, a = a0 + span * (i / 32);
      const r0 = r - (major ? 14 : 7), ca = Math.cos(a), sa = Math.sin(a);
      c.strokeStyle = i / 32 >= redline ? '#d9412e' : (major ? '#f2efe9' : 'rgba(242,239,233,0.55)');
      c.lineWidth = major ? 3 : 1.5;
      c.beginPath(); c.moveTo(cx + ca * r0, cy + sa * r0); c.lineTo(cx + ca * (r - 1), cy + sa * (r - 1)); c.stroke();
    }
    c.fillStyle = 'rgba(242,239,233,0.8)'; c.font = "italic 700 15px 'Barlow Condensed','Oswald','Arial Narrow',Impact,sans-serif";
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i <= 8; i++) {
      const a = a0 + span * (i / 8);
      c.fillText(String(i), cx + Math.cos(a) * (r - 27), cy + Math.sin(a) * (r - 27));
    }
    // needle
    const v = Math.max(0, Math.min(1, rpmNorm)), an = a0 + span * v;
    c.strokeStyle = v > redline ? '#d9412e' : '#f2efe9'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx + Math.cos(an) * 62, cy + Math.sin(an) * 62); c.lineTo(cx + Math.cos(an) * (r - 16), cy + Math.sin(an) * (r - 16)); c.stroke();
  }

  /**
   * data: { speed (m/s) | speedKmh, rpm, maxRpm=8000, gear, nitro 0..1, position, racers, lap, laps, time, lapTime, bestLap,
   *   countdown, wrongWay, mode, driftScore, driftCombo, heat 0..5, targetTime, surviveLeft, message,
   *   player:{x,z,heading}, others:[{x,z}], police:[{x,z}] }
   */
  update(d) {
    const kmh = d.speedKmh != null ? d.speedKmh : Math.abs(d.speed || 0) * 3.6;
    this._set('spd', this.speedEl, String(Math.round(kmh)));
    const g = d.gear == null ? 'N' : (d.gear < 0 ? 'R' : d.gear === 0 ? 'N' : String(d.gear));
    this._set('gear', this.gearEl, g);
    const rpmN = d.rpm == null ? 0 : (d.rpm > 1.5 ? d.rpm / (d.maxRpm || 8000) : d.rpm);
    this._drawTach(rpmN);
    const n = Math.round(Math.max(0, Math.min(1, d.nitro || 0)) * 100);
    if (this._cache.nitro !== n) { this._cache.nitro = n; this.nitroFill.style.width = n + '%'; }

    if (d.position != null) this._set('pos', this.posEl, `${d.position}<small>/${d.racers || 1}</small>`, true);
    if (d.laps != null) this._set('lap', this.lapEl, d.mode === 'pursuit' ? 'PURSUIT' : `LAP ${d.lap}/${d.laps}`);
    this._set('time', this.timeEl, formatTime(d.time || 0));
    this._set('lapt', this.lapTimeEl, `${formatTime(d.lapTime)} / ${formatTime(d.bestLap)}`);
    let modeTxt = '';
    if (d.mode === 'timeTrial' && d.targetTime) modeTxt = `TARGET ${formatTime(d.targetTime)}`;
    else if (d.mode === 'pursuit' && d.surviveLeft != null) modeTxt = `SURVIVE ${Math.ceil(d.surviveLeft)}s`;
    else if (d.mode === 'drift' && d.targetScore) modeTxt = `TARGET ${d.targetScore.toLocaleString()}`;
    else if (d.mode === 'knockout') modeTxt = 'LAST PLACE IS OUT';
    this._set('mode', this.modeEl, modeTxt);

    const cd = d.countdown || '';
    if (this._cache.cd !== cd) {
      this._cache.cd = cd; this.countEl.textContent = cd;
      this.countEl.classList.remove('pop'); void this.countEl.offsetWidth; if (cd) this.countEl.classList.add('pop');
      this.countEl.classList.toggle('go', cd === 'GO');
    }
    const ww = !!d.wrongWay;
    if (this._cache.ww !== ww) { this._cache.ww = ww; this.wrongEl.classList.toggle('hidden', !ww); }
    this._set('msg', this.msgEl, d.message || '');

    const showDrift = d.mode === 'drift' || (d.driftScore > 0 && d.drifting);
    if (this._cache.sd !== showDrift) { this._cache.sd = showDrift; this.driftEl.classList.toggle('hidden', !showDrift); }
    if (showDrift) this._set('drift', this.driftEl, `${(d.driftScore || 0).toLocaleString()}<small>x${(d.driftCombo || 1).toFixed(1)}</small>`, true);

    const heat = d.heat || 0;
    const showHeat = heat > 0 || d.mode === 'pursuit';
    if (this._cache.sh !== showHeat) { this._cache.sh = showHeat; this.heatWrap.classList.toggle('hidden', !showHeat); }
    const hq = Math.ceil(heat);
    if (this._cache.heat !== hq) { this._cache.heat = hq; this.heatPips.forEach((p, i) => p.classList.toggle('on', i < hq)); }

    this._drawMap(d.player, d.others, d.police);
  }
}
