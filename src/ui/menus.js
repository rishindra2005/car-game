// Menus: main menu, event map, garage (cars + upgrades), challenges, settings,
// dialogue, results, pause, loading. Pure DOM rendered into the #ui root.
import { CARS, UPGRADES, applyUpgrades } from '../vehicles/catalog.js';
import { EVENTS, ACT_BOSSES } from '../game/events.js';
import { STORY, CHARACTERS, getAct, getEventDialogue } from '../game/story.js';
import { CHALLENGES, evaluateChallenge, dailyChallenges } from '../game/challenges.js';
import { formatTime } from './hud.js';

export const DEFAULT_SETTINGS = {
  preset: 'medium',          // low | medium | high | ultra
  resolution: 'native',      // 720p | 1080p | 1440p | 2.5k | native
  renderScale: 1,
  renderer: 'auto',          // auto | webgpu | webgl
  traffic: 'medium',         // off | low | medium | high
  pathTracing: true,         // photo-mode path tracer enabled
  volume: 0.7,
  music: 0.35,
  cameraShake: true
};
export const RESOLUTIONS = { '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '2.5k': [2560, 1440], native: null };
export const TRAFFIC_LEVELS = { off: 0, low: 6, medium: 14, high: 26 };
const TYPE_LABEL = { circuit: 'Circuit', sprint: 'Sprint', drift: 'Drift', timeTrial: 'Time Trial', pursuit: 'Pursuit', knockout: 'Knockout' };
const TYPE_ICON = { circuit: 'CIR', sprint: 'SPR', drift: 'DRF', timeTrial: 'TT', pursuit: 'PUR', knockout: 'KO' };

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const hex = (c) => typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : (c || '#888');

export class Menus {
  constructor(root, { career, onStartEvent, onSettingsChange, onFreeRoam } = {}) {
    this.root = root;
    this.career = career;
    this.onStartEvent = onStartEvent || (() => {});
    this.onSettingsChange = onSettingsChange || (() => {});
    this.onFreeRoam = onFreeRoam;
    this.settings = { ...DEFAULT_SETTINGS, ...((career && career.settings) || {}) };
    this.el = document.createElement('div');
    this.el.className = 'vr-menus';
    root.appendChild(this.el);
    this._keyHandler = null;
    if (career && career.ensureStarter) career.ensureStarter(CARS);
  }

  // ---------- helpers ----------
  _screen(html, cls = '') {
    this._clearKeys();
    this.el.innerHTML = `<div class="vr-screen ${cls}">${html}</div>`;
    this.el.classList.remove('hidden');
    return this.el.firstElementChild;
  }
  _clearKeys() { if (this._keyHandler) { window.removeEventListener('keydown', this._keyHandler); this._keyHandler = null; } }
  _keys(fn) { this._clearKeys(); this._keyHandler = fn; window.addEventListener('keydown', fn); }
  _bind(scr, sel, fn) { scr.querySelectorAll(sel).forEach(b => b.addEventListener('click', (e) => fn(b, e))); }
  hide() { this._clearKeys(); this.el.innerHTML = ''; this.el.classList.add('hidden'); }
  _topbar(title, back = true) {
    const c = this.career;
    return `<header class="vr-topbar">
      ${back ? '<button class="btn ghost" data-back>‹ Back</button>' : '<span></span>'}
      <h2>${esc(title)}</h2>
      <div class="wallet"><span>${money(c.money)}</span><span class="rep">REP ${c.reputation.toLocaleString()}</span><span class="chap">ACT ${c.chapter}</span></div>
    </header>`;
  }

  // ---------- main ----------
  showMain() {
    const c = this.career;
    const started = Object.keys(c.completed).length > 0 || c.seenIntro;
    const scr = this._screen(`
            <div class="main-wrap">
        <div class="logo"><span class="l1">VELOCITY RUSH</span><span class="l3">HARBOR CITY</span></div>
        <nav class="main-nav">
          <button class="btn primary" data-act="story">${started ? 'Continue Story' : 'New Story'}</button>
          <button class="btn" data-act="map">Event Map</button>
          <button class="btn" data-act="garage">Garage</button>
          <button class="btn" data-act="challenges">Challenges</button>
          ${this.onFreeRoam ? '<button class="btn" data-act="free">Free Roam</button>' : ''}
          <button class="btn" data-act="settings">Settings</button>
        </nav>
        <div class="main-foot">${money(c.money)} · REP ${c.reputation.toLocaleString()} · Act ${c.chapter}/4 ${c.isStoryComplete ? '· Story complete' : ''}</div>
      </div>`, 'main');
    this._bind(scr, '[data-act]', (b) => {
      const a = b.dataset.act;
      if (a === 'story') this._continueStory();
      else if (a === 'map') this.showEventMap();
      else if (a === 'garage') this.showGarage();
      else if (a === 'challenges') this.showChallenges();
      else if (a === 'settings') this.showSettings();
      else if (a === 'free') { this.hide(); this.onFreeRoam(); }
    });
  }

  _continueStory() {
    const c = this.career;
    if (!c.seenIntro) {
      this.showDialogue(STORY.prologue, () => { c.seenIntro = true; c.save(); this._continueStory(); });
      return;
    }
    const next = EVENTS.find(e => !e.side && c.isEventUnlocked(e) && !c.isCompleted(e.id));
    if (next) this._eventDetail(next); else this.showEventMap();
  }

  // ---------- event map ----------
  showEventMap(chapter = this.career.chapter) {
    const c = this.career;
    const tabs = STORY.acts.map(a => `<button class="tab ${a.chapter === chapter ? 'on' : ''} ${c.isChapterUnlocked(a.chapter) ? '' : 'locked'}" data-ch="${a.chapter}">${esc(a.title)}</button>`).join('');
    const act = getAct(chapter);
    const boss = ACT_BOSSES[chapter];
    const list = EVENTS.filter(e => e.chapter === chapter).map(e => {
      const un = c.isEventUnlocked(e), done = c.isCompleted(e.id);
      const rec = c.completed[e.id];
      return `<button class="event-card ${un ? '' : 'locked'} ${done ? 'done' : ''} ${e.boss ? 'boss' : ''}" data-ev="${e.id}" ${un ? '' : 'disabled'}>
        <span class="ev-icon">${TYPE_ICON[e.type]}</span>
        <span class="ev-name">${esc(e.name)}${e.side ? ' <em>side</em>' : ''}</span>
        <span class="ev-meta">${TYPE_LABEL[e.type]} · ${esc(e.trackId)} ${e.type !== 'pursuit' && e.type !== 'sprint' ? '· ' + e.laps + ' laps' : ''}</span>
        <span class="ev-reward">${money(e.reward.money)}</span>
        <span class="ev-state">${done ? '✓ ' + (rec.bestPlace ? 'P' + rec.bestPlace : 'Cleared') : un ? 'Available' : 'Locked'}</span>
      </button>`;
    }).join('');
    const scr = this._screen(`${this._topbar('Event Map')}
      <div class="tabs">${tabs}</div>
      <div class="act-head"><h3>${esc(act.subtitle)}</h3><p>Crew boss: <b>${esc(boss.name)}</b> — ${esc(boss.crew)}</p></div>
      <div class="event-grid">${c.isChapterUnlocked(chapter) ? list : '<p class="muted">Defeat the previous crew boss to unlock this act.</p>'}</div>`, 'map');
    this._bind(scr, '[data-back]', () => this.showMain());
    this._bind(scr, '[data-ch]', (b) => { const ch = +b.dataset.ch; if (c.isChapterUnlocked(ch)) this.showEventMap(ch); });
    this._bind(scr, '[data-ev]', (b) => this._eventDetail(EVENTS.find(e => e.id === b.dataset.ev)));
  }

  _eventDetail(ev) {
    const c = this.career;
    const owned = CARS.filter(car => c.owns(car.id));
    if (!c.selectedCar && owned[0]) c.selectedCar = owned[0].id;
    const opts = owned.map(car => `<option value="${car.id}" ${car.id === c.selectedCar ? 'selected' : ''}>${esc(car.name)} (${car.class})</option>`).join('');
    const extra = ev.targetTime ? `Target time: ${formatTime(ev.targetTime)}` : ev.targetScore ? `Target score: ${ev.targetScore.toLocaleString()}` : ev.surviveTime ? `Survive: ${ev.surviveTime}s` : `Rivals: ${ev.rivals}`;
    const scr = this._screen(`${this._topbar(ev.name)}
      <div class="detail">
        <div class="detail-type">${TYPE_LABEL[ev.type]}${ev.boss ? ' · BOSS' : ''}</div>
        <ul class="objectives">${ev.objectives.map(o => `<li>${esc(o)}</li>`).join('')}</ul>
        <p>Track: <b>${esc(ev.trackId)}</b> · ${ev.type === 'pursuit' ? 'Open roads' : ev.laps + ' lap(s)'} · ${extra}</p>
        <p>Reward: <b>${money(ev.reward.money)}</b> · ${ev.reward.rep} REP</p>
        <label class="field">Car <select data-car>${opts}</select></label>
        <div class="row"><button class="btn primary" data-go>Start Event</button><button class="btn ghost" data-garage>Garage</button></div>
      </div>`, 'detail-screen');
    this._bind(scr, '[data-back]', () => this.showEventMap(ev.chapter));
    this._bind(scr, '[data-garage]', () => this.showGarage());
    scr.querySelector('[data-car]').addEventListener('change', (e) => c.selectCar(e.target.value));
    this._bind(scr, '[data-go]', () => this._launch(ev));
  }

  _launch(ev) {
    const c = this.career;
    const go = () => {
      const pre = getEventDialogue(ev.id).pre;
      const start = () => { this.hide(); this.onStartEvent(ev, c.selectedCar); };
      if (pre.length) this.showDialogue(pre, start); else start();
    };
    const act = getAct(ev.chapter);
    if (act && !c.seenActs.includes(act.id) && !ev.side) {
      this.showDialogue(act.intro, () => { c.seenActs.push(act.id); c.save(); go(); }, act.title);
    } else go();
  }

  // ---------- garage ----------
  showGarage(tab = 'owned') {
    const c = this.career;
    const cur = CARS.find(x => x.id === c.selectedCar) || CARS[0];
    const ups = c.getUpgrades(cur.id);
    const spec = applyUpgrades(cur.spec, ups);
    const bar = (label, v, max) => `<div class="stat"><span>${label}</span><i><b style="width:${Math.min(100, v / max * 100)}%"></b></i></div>`;
    const stats = `${bar('Power', spec.power, 800)}${bar('Top speed', spec.maxSpeed * 3.6, 380)}${bar('Grip', spec.grip, 1.6)}${bar('Lightness', 2200 - spec.mass, 1100)}`;
    const upHtml = Object.entries(UPGRADES).map(([k, u]) => {
      const lvl = ups[k] || 0, max = u.levels.length;
      const next = u.levels[lvl];
      const pips = Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      const locked = next && lvl + 1 > c.chapter;
      return `<div class="upgrade"><div><b>${esc(u.name)}</b><div class="pips">${pips}</div></div>
        ${next ? `<button class="btn small" data-up="${k}" ${locked || c.money < next.price ? 'disabled' : ''}>${locked ? 'Act ' + (lvl + 1) : money(next.price)}</button>` : '<span class="muted">MAX</span>'}</div>`;
    }).join('');
    const list = CARS.filter(car => tab === 'owned' ? c.owns(car.id) : !c.owns(car.id)).map(car => {
      const lockedCls = !c.isCarClassUnlocked(car.class);
      const action = tab === 'owned'
        ? `<button class="btn small" data-sel="${car.id}" ${car.id === c.selectedCar ? 'disabled' : ''}>${car.id === c.selectedCar ? 'Selected' : 'Select'}</button>`
        : `<button class="btn small" data-buy="${car.id}" ${lockedCls || c.money < car.price ? 'disabled' : ''}>${lockedCls ? 'Class ' + car.class : money(car.price)}</button>`;
      return `<div class="car-card ${car.id === c.selectedCar ? 'sel' : ''}">
        <span class="swatch" style="background:${hex(car.color)}"></span>
        <div><b>${esc(car.name)}</b><small>Class ${car.class} · ${car.bodyStyle} · ${Math.round(car.spec.power)} kW</small></div>${action}</div>`;
    }).join('') || '<p class="muted">Nothing here yet.</p>';
    const scr = this._screen(`${this._topbar('Garage')}
      <div class="garage">
        <section class="garage-main">
          <div class="car-hero"><span class="swatch big" style="background:${hex(cur.color)}"></span><div><h3>${esc(cur.name)}</h3><small>Class ${cur.class} · ${cur.bodyStyle}</small></div></div>
          <div class="stats">${stats}</div>
          <h4>Performance Shop</h4><div class="upgrades">${upHtml}</div>
        </section>
        <section class="garage-list">
          <div class="tabs"><button class="tab ${tab === 'owned' ? 'on' : ''}" data-tab="owned">My Cars</button><button class="tab ${tab === 'shop' ? 'on' : ''}" data-tab="shop">Dealership</button></div>
          <div class="car-list">${list}</div>
        </section>
      </div><div class="toast" data-toast></div>`, 'garage-screen');
    const toast = (m) => { const t = scr.querySelector('[data-toast]'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1600); };
    this._bind(scr, '[data-back]', () => this.showMain());
    this._bind(scr, '[data-tab]', (b) => this.showGarage(b.dataset.tab));
    this._bind(scr, '[data-sel]', (b) => { c.selectCar(b.dataset.sel); this.showGarage(tab); });
    this._bind(scr, '[data-buy]', (b) => {
      const r = c.buyCar(CARS.find(x => x.id === b.dataset.buy));
      if (r.ok) this.showGarage('owned'); else toast(r.reason === 'funds' ? 'Not enough money' : 'Locked');
    });
    this._bind(scr, '[data-up]', (b) => {
      const r = c.buyUpgrade(cur.id, b.dataset.up, UPGRADES);
      if (r.ok) this.showGarage(tab); else toast(r.reason === 'funds' ? 'Not enough money' : r.reason === 'locked' ? 'Unlocks in a later act' : 'Unavailable');
    });
  }

  // ---------- challenges ----------
  showChallenges() {
    const c = this.career;
    const claimed = c.claimedChallenges || (c.claimedChallenges = []);
    const daily = dailyChallenges().map(d => d.id);
    const rows = CHALLENGES.filter(ch => !ch.daily || daily.includes(ch.id)).map(ch => {
      const r = evaluateChallenge(ch, c.stats);
      const isClaimed = claimed.includes(ch.id);
      return `<div class="challenge ${r.complete ? 'complete' : ''}">
        <div><b>${esc(ch.name)}</b><small>${esc(ch.desc)}</small><div class="progress"><b style="width:${(r.progress * 100).toFixed(1)}%"></b></div></div>
        <div>${isClaimed ? '<span class="muted">Claimed</span>' : `<button class="btn small" data-claim="${ch.id}" ${r.complete ? '' : 'disabled'}>${money(ch.reward)}</button>`}</div></div>`;
    }).join('');
    const scr = this._screen(`${this._topbar('Challenges')}<div class="challenge-list">${rows}</div>`, 'challenges');
    this._bind(scr, '[data-back]', () => this.showMain());
    this._bind(scr, '[data-claim]', (b) => {
      const ch = CHALLENGES.find(x => x.id === b.dataset.claim);
      if (!claimed.includes(ch.id) && evaluateChallenge(ch, c.stats).complete) { claimed.push(ch.id); c.money += ch.reward; c.save(); }
      this.showChallenges();
    });
  }

  // ---------- settings ----------
  showSettings(onBack) {
    const s = this.settings;
    const sel = (key, opts) => `<select data-k="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(s[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const scr = this._screen(`${this._topbar('Settings')}
      <div class="settings">
        <label class="field">Quality preset ${sel('preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']])}</label>
        <label class="field">Resolution ${sel('resolution', [['720p', '1280×720 (720p)'], ['1080p', '1920×1080 (1080p)'], ['1440p', '2560×1440 (1440p)'], ['2.5k', '2.5K (2560×1440)'], ['native', 'Native']])}</label>
        <label class="field">Render scale <span><input type="range" min="0.5" max="2" step="0.05" data-k="renderScale" value="${s.renderScale}"><output>${Math.round(s.renderScale * 100)}%</output></span></label>
        <label class="field">Renderer ${sel('renderer', [['auto', 'Auto'], ['webgpu', 'WebGPU'], ['webgl', 'WebGL 2']])}</label>
        <label class="field">Traffic density ${sel('traffic', [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}</label>
        <label class="field">Photo mode path tracing <input type="checkbox" data-k="pathTracing" ${s.pathTracing ? 'checked' : ''}></label>
        <label class="field">Camera shake <input type="checkbox" data-k="cameraShake" ${s.cameraShake ? 'checked' : ''}></label>
        <label class="field">Master volume <span><input type="range" min="0" max="1" step="0.05" data-k="volume" value="${s.volume}"><output>${Math.round(s.volume * 100)}%</output></span></label>
        <label class="field">Music volume <span><input type="range" min="0" max="1" step="0.05" data-k="music" value="${s.music}"><output>${Math.round(s.music * 100)}%</output></span></label>
        <p class="muted small">Renderer changes apply after reload. Press P in-game for Photo Mode.</p>
        <div class="row"><button class="btn danger ghost" data-reset>Reset career</button></div>
      </div>`, 'settings-screen');
    this._bind(scr, '[data-back]', () => (onBack ? onBack() : this.showMain()));
    scr.querySelectorAll('[data-k]').forEach(inp => {
      const ev = inp.type === 'range' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        const k = inp.dataset.k;
        let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? parseFloat(inp.value) : inp.value;
        s[k] = v;
        const out = inp.parentElement.querySelector('output'); if (out) out.textContent = Math.round(v * 100) + '%';
        this.career.settings = { ...s }; this.career.save();
        this.onSettingsChange({ ...s, resolutionSize: RESOLUTIONS[s.resolution], trafficCount: TRAFFIC_LEVELS[s.traffic] });
      });
    });
    this._bind(scr, '[data-reset]', () => {
      if (typeof confirm === 'function' && !confirm('Erase all career progress?')) return;
      this.career.reset(); this.career.ensureStarter(CARS); this.showMain();
    });
  }

  // ---------- dialogue ----------
  showDialogue(lines, cb, title = '') {
    if (!lines || !lines.length) { if (cb) cb(); return; }
    let i = -1;
    const scr = this._screen(`<div class="dialogue-bg"></div>
      ${title ? `<div class="dialogue-title">${esc(title)}</div>` : ''}
      <div class="dialogue">
        <div class="portrait"></div>
        <div class="dlg-body"><div class="speaker"></div><div class="role"></div><p class="line"></p></div>
        <div class="dlg-ctrl"><button class="btn ghost small" data-skip>Skip</button><button class="btn primary small" data-next>Next ›</button></div>
      </div>`, 'dialogue-screen');
    const sp = scr.querySelector('.speaker'), role = scr.querySelector('.role'), line = scr.querySelector('.line'), por = scr.querySelector('.portrait');
    let typing = null;
    const done = () => { clearInterval(typing); this.hide(); if (cb) cb(); };
    const next = () => {
      if (typing && line.dataset.full && line.textContent !== line.dataset.full) { clearInterval(typing); line.textContent = line.dataset.full; return; }
      i++;
      if (i >= lines.length) return done();
      const L = lines[i], ch = CHARACTERS[L.speaker] || { name: L.speaker, role: '', color: '#fff' };
      sp.textContent = ch.name; sp.style.color = ch.color; role.textContent = ch.role;
      por.textContent = ch.name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('');
      por.style.setProperty('--c', ch.color);
      line.dataset.full = L.text; line.textContent = '';
      let k = 0; clearInterval(typing);
      typing = setInterval(() => { k += 2; line.textContent = L.text.slice(0, k); if (k >= L.text.length) clearInterval(typing); }, 16);
    };
    this._bind(scr, '[data-next]', next);
    this._bind(scr, '[data-skip]', done);
    scr.querySelector('.dialogue').addEventListener('click', (e) => { if (!e.target.closest('button')) next(); });
    this._keys((e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); next(); } else if (e.code === 'Escape') done(); });
    next();
  }

  // ---------- results ----------
  /**
   * results: RaceSession.results. If `results.reward` is undefined and the event exists in the career,
   * the result is recorded via career.completeEvent and the reward displayed. Post-event (and act outro)
   * dialogue plays after the player continues, then cb().
   */
  showResults(results, cb) {
    const c = this.career;
    const ev = EVENTS.find(e => e.id === results.eventId);
    if (ev && results.reward === undefined && c) {
      results.reward = c.completeEvent(ev.id, results.place, results.time, {
        score: results.score, survived: results.survived, escaped: results.escaped, busted: results.busted, eliminated: results.eliminated, dnf: results.dnf
      });
      if (results.stats) c.recordStats(results.stats);
    }
    const r = results.reward || {};
    const passed = results.passed != null ? results.passed : r.passed;
    let headline = passed ? 'VICTORY' : 'DEFEAT';
    if (results.type === 'pursuit') headline = results.escaped ? 'ESCAPED' : results.survived ? 'SURVIVED' : 'BUSTED';
    if (results.eliminated) headline = 'ELIMINATED';
    if (results.dnf) headline = 'DID NOT FINISH';
    const rows = (results.standings || []).map(s => `<tr class="${s.isPlayer ? 'me' : ''}"><td>${s.place}</td><td>${esc(s.name)}</td><td>${s.eliminated ? 'OUT' : formatTime(s.time)}</td><td>${formatTime(s.bestLap)}</td></tr>`).join('');
    const extra = [];
    if (results.type === 'drift') extra.push(`Drift score <b>${(results.score || 0).toLocaleString()}</b>${results.targetScore ? ' / ' + results.targetScore.toLocaleString() : ''}`);
    if (results.type === 'timeTrial') extra.push(`Time <b>${formatTime(results.time)}</b> / target ${formatTime(results.targetTime)}`);
    if (results.bestLap) extra.push(`Best lap <b>${formatTime(results.bestLap)}</b>`);
    if (results.stats && results.stats.topSpeed) extra.push(`Top speed <b>${Math.round(results.stats.topSpeed)} km/h</b>`);
    const scr = this._screen(`
      <div class="results ${passed ? 'win' : 'lose'}">
        <h1 class="headline">${headline}</h1>
        <h3>${esc(ev ? ev.name : results.eventId || 'Race')}${results.place && results.type !== 'pursuit' ? ` — P${results.place}` : ''}</h3>
        <p class="res-extra">${extra.join(' · ')}</p>
        ${rows ? `<table class="standings"><thead><tr><th>#</th><th>Driver</th><th>Time</th><th>Best lap</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
        <div class="reward"><span>+${money(r.money || 0)}</span><span>+${r.rep || 0} REP</span>${r.chapterUnlocked ? `<span class="unlock">ACT ${r.chapterUnlocked} UNLOCKED</span>` : ''}</div>
        <div class="row"><button class="btn primary" data-cont>Continue</button>${ev ? '<button class="btn ghost" data-retry>Retry</button>' : ''}</div>
      </div>`, 'results-screen');
    const cont = () => {
      const post = passed && ev ? getEventDialogue(ev.id).post : [];
      const act = ev && ev.boss && passed ? getAct(ev.chapter) : null;
      const finish = () => { this.hide(); if (cb) cb(); };
      const outro = () => (act ? this.showDialogue(act.outro, finish, act.title + ' — Complete') : finish());
      if (post.length) this.showDialogue(post, outro); else outro();
    };
    this._bind(scr, '[data-cont]', cont);
    this._bind(scr, '[data-retry]', () => { this.hide(); this.onStartEvent(ev, c.selectedCar); });
    this._keys((e) => { if (e.code === 'Enter') cont(); });
  }

  // ---------- pause ----------
  showPause(onResume, onQuit) {
    const scr = this._screen(`<div class="pause"><h2>PAUSED</h2>
      <button class="btn primary" data-resume>Resume</button>
      <button class="btn" data-settings>Settings</button>
      <button class="btn danger ghost" data-quit>Quit to Menu</button>
      <p class="muted small">W/A/S/D or arrows · Space handbrake · Shift nitro · C camera · P photo mode</p></div>`, 'pause-screen');
    const resume = () => { this.hide(); if (onResume) onResume(); };
    this._bind(scr, '[data-resume]', resume);
    this._bind(scr, '[data-quit]', () => { this.hide(); if (onQuit) onQuit(); });
    this._bind(scr, '[data-settings]', () => this.showSettings(() => this.showPause(onResume, onQuit)));
    this._keys((e) => { if (e.code === 'Escape') { e.stopPropagation(); resume(); } });
  }

  // ---------- loading ----------
  showLoading(text = 'Loading…') {
    this._screen(`<div class="loading"><div class="spinner"></div><p>${esc(text)}</p></div>`, 'loading-screen');
  }
}
