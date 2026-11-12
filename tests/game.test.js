import { describe, it, expect } from 'vitest';
import { Career, MemoryStorage, SAVE_KEY } from '../src/game/career.js';
import { EVENTS, EVENT_TYPES, TRACK_IDS, ACT_BOSSES, isEventPassed } from '../src/game/events.js';
import { STORY, EVENT_DIALOGUE, CHARACTERS } from '../src/game/story.js';
import { CHALLENGES, evaluateChallenge, evaluateAll, dailyChallenges, newlyCompleted } from '../src/game/challenges.js';
import { RaceSession } from '../src/game/race.js';
import { Input } from '../src/game/input.js';

// ---------- helpers ----------
// Fake circular track: progress = position.x in [0,1) (wrapping)
const fakeTrack = (cps = [0.25, 0.5, 0.75]) => ({
  checkpoints: cps,
  progressAt(p) { return ((p.x % 1) + 1) % 1; }
});
const body = (x, speed = 30) => ({ position: { x, y: 0, z: 0 }, speed });
const ev = (o = {}) => ({ id: 'test', type: 'circuit', laps: 2, reward: { money: 1000, rep: 10 }, winPlace: 1, ...o });

function drive(race, b, from, to, steps = 40, dt = 0.1) {
  for (let i = 1; i <= steps; i++) { b.position.x = from + (to - from) * (i / steps); race.update(dt); }
}

class FakeTarget {
  constructor() { this.l = {}; }
  addEventListener(t, fn) { (this.l[t] ||= []).push(fn); }
  removeEventListener(t, fn) { this.l[t] = (this.l[t] || []).filter(f => f !== fn); }
  emit(t, e) { (this.l[t] || []).forEach(f => f({ preventDefault() {}, ...e })); }
}

// ---------- career ----------
describe('Career', () => {
  it('falls back to in-memory storage when localStorage is unavailable', () => {
    const c = new Career();
    expect(c.storage).toBeTruthy();
    expect(c.save()).toBe(true);
  });

  it('save/load roundtrip', () => {
    const storage = new MemoryStorage();
    const a = new Career({ storage });
    a.ensureStarter([{ id: 'x', price: 100, class: 'D' }, { id: 'y', price: 50, class: 'D' }]);
    a.money = 12345; a.reputation = 77;
    a.upgrades.y = { engine: 2, tires: 1, nitro: 0, weight: 0 };
    a.completeEvent('a1-harbor-intro', 1, 120);
    a.save();
    expect(storage.getItem(SAVE_KEY)).toBeTruthy();
    const b = new Career({ storage });
    expect(b.load()).toBe(true);
    expect(b.money).toBe(a.money);
    expect(b.reputation).toBe(a.reputation);
    expect(b.garage).toEqual(['y']);
    expect(b.upgrades.y.engine).toBe(2);
    expect(b.isCompleted('a1-harbor-intro')).toBe(true);
    expect(b.completed['a1-harbor-intro'].bestTime).toBe(120);
  });

  it('load returns false on empty/corrupt storage', () => {
    const storage = new MemoryStorage();
    expect(new Career({ storage }).load()).toBe(false);
    storage.setItem(SAVE_KEY, '{bad json');
    expect(new Career({ storage }).load()).toBe(false);
  });

  it('unlocks events by requirements and chapters by bosses', () => {
    const c = new Career({ storage: new MemoryStorage() });
    expect(c.isEventUnlocked('a1-harbor-intro')).toBe(true);
    expect(c.isEventUnlocked('a1-dock-sprint')).toBe(false);
    expect(c.isEventUnlocked('a2-grid-circuit')).toBe(false);
    c.completeEvent('a1-harbor-intro', 2, 100);
    expect(c.isEventUnlocked('a1-dock-sprint')).toBe(true);
    // failing a boss doesn't unlock
    c.completeEvent('a1-dock-sprint', 1, 90);
    c.completeEvent('a1-crane-drift', null, 100, { score: 9000 });
    c.completeEvent('a1-tide-trial', null, 180);
    expect(c.isEventUnlocked('a1-boss-vale')).toBe(true);
    let r = c.completeEvent('a1-boss-vale', 3, 300);
    expect(r.passed).toBe(false);
    expect(c.chapter).toBe(1);
    r = c.completeEvent('a1-boss-vale', 1, 290);
    expect(r.passed).toBe(true);
    expect(r.chapterUnlocked).toBe(2);
    expect(c.isEventUnlocked('a2-grid-circuit')).toBe(true);
    expect(c.unlocked).toContain('a2-grid-circuit');
  });

  it('economy: rewards, car purchase and upgrade gating', () => {
    const c = new Career({ storage: new MemoryStorage() });
    const m0 = c.money;
    c.completeEvent('a1-harbor-intro', 1, 100);
    expect(c.money).toBe(m0 + 4000);
    expect(c.buyCar({ id: 'fast', class: 'S', price: 1 }).reason).toBe('locked');
    expect(c.buyCar({ id: 'pricey', class: 'D', price: 1e9 }).reason).toBe('funds');
    expect(c.buyCar({ id: 'ok', class: 'C', price: 1000 }).ok).toBe(true);
    const UP = { engine: { levels: [{ price: 100 }, { price: 200 }] } };
    expect(c.buyUpgrade('ok', 'engine', UP).ok).toBe(true);
    expect(c.buyUpgrade('ok', 'engine', UP).reason).toBe('locked'); // level 2 needs chapter 2
    c.chapter = 2;
    expect(c.buyUpgrade('ok', 'engine', UP).level).toBe(2);
    expect(c.buyUpgrade('ok', 'engine', UP).reason).toBe('maxed');
  });
});

// ---------- events / story ----------
describe('Events & story', () => {
  it('has >= 15 events with valid types, chapters, tracks and unique ids', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(15);
    const ids = new Set();
    for (const e of EVENTS) {
      expect(EVENT_TYPES).toContain(e.type);
      expect([1, 2, 3, 4]).toContain(e.chapter);
      expect(TRACK_IDS).toContain(e.trackId);
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      expect(e.reward.money).toBeGreaterThan(0);
      for (const r of e.requirements.events || []) expect(EVENTS.find(x => x.id === r)).toBeTruthy();
      if (e.type === 'drift') expect(e.targetScore).toBeGreaterThan(0);
      if (e.type === 'timeTrial') expect(e.targetTime).toBeGreaterThan(0);
      if (e.type === 'pursuit') expect(e.surviveTime).toBeGreaterThan(0);
    }
    for (const t of EVENT_TYPES) expect(EVENTS.some(e => e.type === t)).toBe(true);
    for (const t of TRACK_IDS) expect(EVENTS.some(e => e.trackId === t)).toBe(true);
  });

  it('each act has a boss event and dialogue speakers exist', () => {
    for (const ch of [1, 2, 3, 4]) {
      const boss = ACT_BOSSES[ch];
      const e = EVENTS.find(x => x.id === boss.eventId);
      expect(e.chapter).toBe(ch);
      expect(e.boss).toBe(boss.characterId);
    }
    expect(STORY.acts.length).toBe(4);
    const lines = [...STORY.prologue, ...STORY.acts.flatMap(a => [...a.intro, ...a.outro]), ...Object.values(EVENT_DIALOGUE).flatMap(d => [...d.pre, ...d.post])];
    for (const l of lines) expect(CHARACTERS[l.speaker]).toBeTruthy();
    for (const id of Object.keys(EVENT_DIALOGUE)) expect(EVENTS.find(e => e.id === id)).toBeTruthy();
  });

  it('isEventPassed per mode', () => {
    expect(isEventPassed({ type: 'drift', targetScore: 100 }, { score: 150 })).toBe(true);
    expect(isEventPassed({ type: 'timeTrial', targetTime: 60 }, { time: 61 })).toBe(false);
    expect(isEventPassed({ type: 'pursuit' }, { escaped: true })).toBe(true);
    expect(isEventPassed({ type: 'circuit', winPlace: 3 }, { place: 3 })).toBe(true);
    expect(isEventPassed({ type: 'knockout', winPlace: 1 }, { place: 1, eliminated: true })).toBe(false);
  });
});

// ---------- race ----------
describe('RaceSession', () => {
  it('runs countdown 3-2-1-GO before racing', () => {
    const seen = [];
    const p = body(0.1);
    const race = new RaceSession({ event: ev(), track: fakeTrack(), playerCar: p, onEvent: (t, d) => t === 'countdown' && seen.push(d) });
    expect(race.state).toBe('countdown');
    for (let i = 0; i < 40; i++) race.update(0.1);
    expect(seen).toEqual(['2', '1', 'GO']);
    expect(race.state).toBe('racing');
  });

  it('counts laps across the wrap-around and finishes', () => {
    const p = body(0.95); // start on grid behind the line
    const race = new RaceSession({ event: ev({ laps: 2 }), track: fakeTrack(), playerCar: p, countdown: 0 });
    drive(race, p, 0.95, 1.05); // cross start line -> lap 1 starts, no lap counted
    expect(race.player.lapsDone).toBe(0);
    expect(race.lap).toBe(1);
    drive(race, p, 1.05, 2.02); // full lap with wrapping x
    expect(race.player.lapsDone).toBe(1);
    expect(race.lap).toBe(2);
    expect(race.finished).toBe(false);
    drive(race, p, 2.02, 3.01);
    expect(race.finished).toBe(true);
    expect(race.results.place).toBe(1);
    expect(race.results.lapTimes.length).toBe(2);
    expect(race.results.passed).toBe(true);
  });

  it('does not count a lap when reversing over the line or skipping checkpoints', () => {
    const p = body(0.1);
    const race = new RaceSession({ event: ev({ laps: 1 }), track: fakeTrack(), playerCar: p, countdown: 0 });
    drive(race, p, 0.1, -0.1); // reverse over line
    drive(race, p, -0.1, 0.1);  // forward back over it
    expect(race.player.lapsDone).toBe(0);
    // teleport-skip: jump straight past finish -> checkpoints still require order (raw unwrap prevents big jumps)
    p.position.x = 0.95; race.update(0.1);
    expect(race.player.lapsDone).toBe(0);
  });

  it('sorts positions by total progress and detects wrong way', () => {
    const p = body(0.3);
    const r1 = { name: 'A', physics: body(0.5) };
    const r2 = { name: 'B', position: { x: 0.1, y: 0, z: 0 }, speed: 20 };
    const race = new RaceSession({ event: ev({ laps: 3 }), track: fakeTrack(), playerCar: p, rivals: [r1, r2], countdown: 0 });
    race.update(0.1);
    expect(race.positions.map(r => r.name)).toEqual(['A', 'You', 'B']);
    expect(race.playerPosition).toBe(2);
    // B goes a lap ahead via wrap
    drive(race, r2, 0.1, 1.2, 30);
    expect(race.positions[0].name).toBe('B');
    // player drives backwards
    drive(race, p, 0.3, 0.2, 20);
    expect(race.wrongWay).toBe(true);
    drive(race, p, 0.2, 0.3, 20);
    expect(race.wrongWay).toBe(false);
  });

  it('knockout eliminates last place per lap', () => {
    const p = body(0.0); const a = body(0.0); const b = body(0.0);
    const race = new RaceSession({ event: ev({ type: 'knockout', laps: 2 }), track: fakeTrack(), playerCar: p, rivals: [{ name: 'A', physics: a }, { name: 'B', physics: b }], countdown: 0 });
    for (let i = 1; i <= 40; i++) { p.position.x = 1.05 * i / 40; a.position.x = 1.02 * i / 40; b.position.x = 0.9 * i / 40; race.update(0.1); }
    expect(race.eliminated.map(r => r.name)).toEqual(['B']);
    for (let i = 1; i <= 40; i++) { p.position.x = 1.05 + 1.0 * i / 40; a.position.x = 1.02 + 0.9 * i / 40; race.update(0.1); }
    expect(race.finished).toBe(true);
    expect(race.results.place).toBe(1);
    expect(race.results.passed).toBe(true);
  });

  it('drift scoring, time trial target and pursuit survival', () => {
    const p = body(0.1, 20); p.drifting = true;
    const d = new RaceSession({ event: ev({ type: 'drift', laps: 1, targetScore: 10 }), track: fakeTrack(), playerCar: p, countdown: 0 });
    drive(d, p, 0.1, 1.1);
    expect(d.finished).toBe(true);
    expect(d.results.score).toBeGreaterThan(10);
    expect(d.results.passed).toBe(true);

    const q = body(0.1);
    const t = new RaceSession({ event: ev({ type: 'timeTrial', laps: 1, targetTime: 1 }), track: fakeTrack(), playerCar: q, countdown: 0 });
    drive(t, q, 0.1, 1.1);
    expect(t.results.passed).toBe(false); // took 4s > 1s

    const s = body(0.1);
    let busted;
    const police = { onBusted(fn) { busted = fn; }, onEscaped() {} };
    const pu = new RaceSession({ event: ev({ type: 'pursuit', laps: 99, surviveTime: 2 }), track: fakeTrack(), playerCar: s, police, countdown: 0 });
    for (let i = 0; i < 25; i++) pu.update(0.1);
    expect(pu.results.survived).toBe(true);
    expect(pu.results.passed).toBe(true);
    const pu2 = new RaceSession({ event: ev({ type: 'pursuit', laps: 99, surviveTime: 20 }), track: fakeTrack(), playerCar: body(0.1), police, countdown: 0 });
    pu2.update(0.1); busted();
    expect(pu2.results.busted).toBe(true);
    expect(pu2.results.passed).toBe(false);
  });
});

// ---------- challenges ----------
describe('Challenges', () => {
  it('evaluates progress from stats', () => {
    const ch = CHALLENGES.find(c => c.id === 'speed-280');
    expect(evaluateChallenge(ch, { topSpeed: 140 }).progress).toBeCloseTo(0.5);
    expect(evaluateChallenge(ch, { topSpeed: 300 }).complete).toBe(true);
    expect(evaluateChallenge(ch, {}).progress).toBe(0);
    const all = evaluateAll({ bestDrift: 25000 });
    expect(all.find(r => r.id === 'drift-20k').complete).toBe(true);
    expect(all.find(r => r.id === 'drift-50k').complete).toBe(false);
    expect(newlyCompleted({ bestDrift: 25000 }, ['drift-20k'])).not.toContain('drift-20k');
    const d = dailyChallenges(new Date('2026-01-01'));
    expect(d.length).toBeGreaterThanOrEqual(1);
    expect(d.every(c => c.daily)).toBe(true);
  });
});

// ---------- input ----------
describe('Input', () => {
  it('maps keyboard events to physics input state', () => {
    const t = new FakeTarget();
    const inp = new Input(t);
    let cam = 0;
    inp.on('camera', () => cam++);
    t.emit('keydown', { code: 'KeyW' });
    t.emit('keydown', { code: 'ShiftLeft' });
    t.emit('keydown', { code: 'Space' });
    inp.update(1);
    expect(inp.state).toMatchObject({ throttle: 1, brake: 0, handbrake: true, nitro: true });
    t.emit('keydown', { code: 'ArrowLeft' });
    inp.update(1);
    expect(inp.state.steer).toBe(-1);
    t.emit('keyup', { code: 'ArrowLeft' });
    t.emit('keydown', { code: 'KeyD' });
    inp.update(1);
    expect(inp.state.steer).toBe(1);
    t.emit('keyup', { code: 'KeyW' });
    t.emit('keydown', { code: 'KeyS' });
    inp.update(1);
    expect(inp.state.throttle).toBe(0);
    expect(inp.state.brake).toBe(1);
    t.emit('keydown', { code: 'KeyC' });
    t.emit('keydown', { code: 'KeyC' }); // key repeat should not refire
    expect(cam).toBe(1);
    inp.update(1);
    expect(inp.wasPressed('camera')).toBe(true);
    inp.update(1);
    expect(inp.wasPressed('camera')).toBe(false);
    t.emit('keydown', { key: 'a' }); // key fallback
    t.emit('keyup', { code: 'KeyD' });
    inp.update(1);
    expect(inp.state.steer).toBe(-1);
    inp.dispose();
    expect(t.l.keydown.length).toBe(0);
  });
});
