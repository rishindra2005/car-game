// Career persistence + economy + unlock logic.
import { EVENTS, getEvent, isEventPassed, computeReward, ACT_BOSSES } from './events.js';

export const SAVE_KEY = 'velocityRush.save.v1';
export const START_MONEY = 12000;
export const MAX_CHAPTER = 4;

/** In-memory Storage-like fallback. */
export class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

function detectStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const t = '__vr_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return localStorage;
    }
  } catch (e) { /* unavailable (privacy mode, node) */ }
  return new MemoryStorage();
}

function defaults() {
  return {
    version: 1,
    money: START_MONEY,
    reputation: 0,
    garage: [],            // owned car ids
    selectedCar: null,
    upgrades: {},          // { carId: { engine, tires, nitro, weight } }
    completed: {},         // { eventId: { bestPlace, bestTime, bestScore, passed, attempts } }
    chapter: 1,            // highest unlocked chapter
    seenIntro: false,
    seenActs: [],
    stats: { races: 0, wins: 0, topSpeed: 0, bestDrift: 0, escapes: 0, distance: 0, nitroTime: 0, cleanLaps: 0 },
    claimedChallenges: [],
    settings: null
  };
}

export class Career {
  constructor({ storage } = {}) {
    this.storage = storage || detectStorage();
    Object.assign(this, defaults());
    this.listeners = [];
  }

  // ---------- persistence ----------
  toJSON() {
    const { version, money, reputation, garage, selectedCar, upgrades, completed, chapter, seenIntro, seenActs, stats, settings, claimedChallenges } = this;
    return { version, money, reputation, garage, selectedCar, upgrades, completed, chapter, seenIntro, seenActs, stats, settings, claimedChallenges };
  }
  save() {
    try { this.storage.setItem(SAVE_KEY, JSON.stringify(this.toJSON())); return true; }
    catch (e) { return false; }
  }
  load() {
    let raw = null;
    try { raw = this.storage.getItem(SAVE_KEY); } catch (e) { raw = null; }
    if (!raw) return false;
    try {
      const d = JSON.parse(raw);
      const base = defaults();
      Object.assign(this, base, d, { stats: { ...base.stats, ...(d.stats || {}) } });
      return true;
    } catch (e) { return false; }
  }
  reset() {
    Object.assign(this, defaults());
    try { this.storage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }
  onChange(fn) { this.listeners.push(fn); }
  _changed() { this.save(); for (const fn of this.listeners) fn(this); }

  // ---------- garage ----------
  /** Give the cheapest car from `cars` if garage is empty. */
  ensureStarter(cars) {
    if (this.garage.length || !cars || !cars.length) return;
    const cheapest = [...cars].sort((a, b) => a.price - b.price)[0];
    this.garage.push(cheapest.id);
    this.selectedCar = cheapest.id;
    this._changed();
  }
  owns(carId) { return this.garage.includes(carId); }
  buyCar(car) {
    if (this.owns(car.id)) return { ok: false, reason: 'owned' };
    if (!this.isCarClassUnlocked(car.class)) return { ok: false, reason: 'locked' };
    if (this.money < car.price) return { ok: false, reason: 'funds' };
    this.money -= car.price;
    this.garage.push(car.id);
    this.selectedCar = car.id;
    this._changed();
    return { ok: true };
  }
  selectCar(carId) { if (this.owns(carId)) { this.selectedCar = carId; this._changed(); } }
  /** Car classes unlock by chapter: ch1 D/C, ch2 B, ch3 A, ch4 S. */
  isCarClassUnlocked(cls) {
    const need = { D: 1, C: 1, B: 2, A: 3, S: 4 }[cls] || 1;
    return this.chapter >= need;
  }
  getUpgrades(carId) { return this.upgrades[carId] || { engine: 0, tires: 0, nitro: 0, weight: 0 }; }
  /** upgradeDefs: UPGRADES map from vehicles/catalog.js */
  buyUpgrade(carId, type, upgradeDefs) {
    if (!this.owns(carId)) return { ok: false, reason: 'not-owned' };
    const def = upgradeDefs && upgradeDefs[type];
    if (!def) return { ok: false, reason: 'unknown' };
    const cur = this.getUpgrades(carId);
    const lvl = cur[type] || 0;
    if (lvl >= def.levels.length) return { ok: false, reason: 'maxed' };
    const maxLevelByChapter = Math.min(def.levels.length, this.chapter); // level N requires chapter N
    if (lvl + 1 > maxLevelByChapter) return { ok: false, reason: 'locked' };
    const price = def.levels[lvl].price;
    if (this.money < price) return { ok: false, reason: 'funds' };
    this.money -= price;
    this.upgrades[carId] = { ...cur, [type]: lvl + 1 };
    this._changed();
    return { ok: true, level: lvl + 1 };
  }

  // ---------- events / unlocks ----------
  get unlocked() {
    return EVENTS.filter(e => this.isEventUnlocked(e)).map(e => e.id);
  }
  isCompleted(id) { return !!(this.completed[id] && this.completed[id].passed); }
  isChapterUnlocked(ch) { return ch <= this.chapter; }
  isEventUnlocked(evOrId) {
    const ev = typeof evOrId === 'string' ? getEvent(evOrId) : evOrId;
    if (!ev || !this.isChapterUnlocked(ev.chapter)) return false;
    const req = ev.requirements || {};
    if (req.events && !req.events.every(id => this.isCompleted(id))) return false;
    if (req.reputation && this.reputation < req.reputation) return false;
    return true;
  }
  availableEvents() { return EVENTS.filter(e => this.isEventUnlocked(e)); }

  /**
   * Record an event result. Signature per contract: completeEvent(id, place, time[, extra])
   * extra = { score, survived, escaped, eliminated, busted, dnf }
   * Returns { money, rep, passed, chapterUnlocked }
   */
  completeEvent(id, place, time, extra = {}) {
    const ev = getEvent(id);
    if (!ev) return { money: 0, rep: 0, passed: false, chapterUnlocked: null };
    const results = { place, time, ...extra };
    const reward = computeReward(ev, results);
    const prev = this.completed[id] || { attempts: 0, passed: false, bestPlace: null, bestTime: null, bestScore: null };
    const firstPass = reward.passed && !prev.passed;
    // Repeat wins pay 50% (to discourage grinding)
    const money = firstPass || !prev.passed ? reward.money : Math.round(reward.money * 0.5);
    this.money += money;
    this.reputation += reward.rep;
    this.completed[id] = {
      attempts: prev.attempts + 1,
      passed: prev.passed || reward.passed,
      bestPlace: place == null ? prev.bestPlace : (prev.bestPlace == null ? place : Math.min(prev.bestPlace, place)),
      bestTime: time == null || !isFinite(time) ? prev.bestTime : (prev.bestTime == null ? time : Math.min(prev.bestTime, time)),
      bestScore: extra.score == null ? prev.bestScore : Math.max(prev.bestScore || 0, extra.score)
    };
    this.stats.races++;
    if (place === 1 || reward.passed) this.stats.wins++;
    if (extra.escaped) this.stats.escapes++;
    let chapterUnlocked = null;
    if (reward.passed && ev.boss && ACT_BOSSES[ev.chapter] && ACT_BOSSES[ev.chapter].eventId === id && this.chapter === ev.chapter && this.chapter < MAX_CHAPTER) {
      this.chapter++;
      chapterUnlocked = this.chapter;
    }
    if (ev.reward.car && firstPass && !this.owns(ev.reward.car)) this.garage.push(ev.reward.car);
    this._changed();
    return { money, rep: reward.rep, passed: reward.passed, chapterUnlocked, firstPass };
  }

  /** Merge race stats into lifetime stats (used by challenges). */
  recordStats(s = {}) {
    const st = this.stats;
    if (s.topSpeed) st.topSpeed = Math.max(st.topSpeed, s.topSpeed);
    if (s.bestDrift) st.bestDrift = Math.max(st.bestDrift, s.bestDrift);
    if (s.distance) st.distance += s.distance;
    if (s.nitroTime) st.nitroTime += s.nitroTime;
    if (s.cleanLaps) st.cleanLaps += s.cleanLaps;
    this._changed();
  }

  get isStoryComplete() { return this.isCompleted(ACT_BOSSES[4].eventId); }
}
