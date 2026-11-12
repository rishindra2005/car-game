// RaceSession: countdown, checkpoints, laps, positions, wrong-way and mode rules.
// Racer bodies only need { position:{x,y,z}, speed } (VehiclePhysics compatible).
// Optional on player body: driftScore (cumulative), drifting, nitro, nitroActive.

import { isEventPassed } from './events.js';

const COUNTDOWN = 3; // seconds before GO

function wrapDelta(d) {
  if (d > 0.5) return d - 1;
  if (d < -0.5) return d + 1;
  return d;
}

function bodyOf(r) { return r && r.physics ? r.physics : r; }

export class RaceSession {
  /**
   * @param {object} o
   * @param {object} [o.engine]
   * @param {object} o.event  event def from events.js
   * @param {object} o.track  { progressAt(pos)->0..1, checkpoints?:number[], tangentAt? }
   * @param {object} o.playerCar VehiclePhysics-like
   * @param {Array} [o.rivals] array of RivalDriver (with .physics) or bodies; optional .name
   * @param {object} [o.police] PoliceSystem (onBusted/onEscaped)
   * @param {function} [o.onEvent] (type, data) => void
   */
  constructor({ engine = null, event, track, playerCar, rivals = [], police = null, onEvent = null, countdown = COUNTDOWN }) {
    this.engine = engine;
    this.event = event;
    this.track = track;
    this.type = event.type;
    this.totalLaps = this.type === 'sprint' ? 1 : Math.max(1, event.laps || 1);
    this.checkpoints = (track.checkpoints && track.checkpoints.length ? track.checkpoints : [0.25, 0.5, 0.75])
      .filter(u => u > 0 && u < 1).sort((a, b) => a - b);
    this.onEvent = onEvent;
    this.police = police;

    this.state = countdown > 0 ? 'countdown' : 'racing'; // countdown | racing | finished
    this.countdown = countdown;
    this.countdownText = countdown > 0 ? String(Math.ceil(countdown)) : '';
    this._goTimer = 0;
    this.time = 0;
    this.finished = false;
    this.results = null;
    this.wrongWay = false;

    this.racers = [];
    this._addRacer(playerCar, 'You', true);
    rivals.forEach((r, i) => this._addRacer(r, (r && r.name) || `Rival ${i + 1}`, false));
    this.player = this.racers[0];
    this.positions = this.racers.slice();
    this.finishOrder = [];

    // mode-specific
    this.driftScore = 0;
    this.driftCombo = 1;
    this._driftBase = typeof playerCar.driftScore === 'number' ? playerCar.driftScore : null;
    this.knockoutRound = 0;
    this.eliminated = [];
    this.pursuitTime = 0;
    this.busted = false;
    this.escaped = false;
    this.stats = { topSpeed: 0, distance: 0, nitroTime: 0 };

    if (police && this.type === 'pursuit') {
      if (police.onBusted) police.onBusted(() => this.notifyBusted());
      if (police.onEscaped) police.onEscaped(() => this.notifyEscaped());
    }
  }

  _addRacer(entry, name, isPlayer) {
    const body = bodyOf(entry);
    const u = this.track.progressAt(body.position);
    this.racers.push({
      id: this.racers.length, name, isPlayer, entry, body,
      lastU: u,
      raw: u > 0.5 ? u - 1 : u,     // unwrapped progress; grid slots behind the line start negative
      lapsDone: 0, cpIndex: 0,
      lapStart: 0, lapTimes: [], bestLap: null,
      finished: false, finishTime: null, eliminated: false,
      wrongTimer: 0
    });
  }

  get lap() { return Math.min(this.totalLaps, this.player.lapsDone + 1); }
  get playerPosition() { return this.positions.indexOf(this.player) + 1; }
  get canDrive() { return this.state === 'racing' || this.state === 'finished'; }
  get activeRacers() { return this.racers.filter(r => !r.eliminated); }

  _emit(type, data) { if (this.onEvent) this.onEvent(type, data); }

  update(dt) {
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      const txt = this.countdown > 0 ? String(n) : 'GO';
      if (txt !== this.countdownText) { this.countdownText = txt; this._emit('countdown', txt); }
      if (this.countdown <= 0) { this.state = 'racing'; this._goTimer = 1; }
      // still track positions on grid
      this._track(0);
      this._rank();
      return;
    }
    if (this._goTimer > 0) { this._goTimer -= dt; if (this._goTimer <= 0) this.countdownText = ''; }
    if (this.state === 'finished') return;
    this.time += dt;

    this._track(dt);
    this._modeRules(dt);
    this._rank();
  }

  _track(dt) {
    for (const r of this.racers) {
      if (r.eliminated) continue;
      const u = this.track.progressAt(r.body.position);
      const d = wrapDelta(u - r.lastU);
      r.lastU = u;
      if (dt <= 0) continue;
      r.raw += d;
      if (r.finished) continue;

      // checkpoints in order
      while (r.cpIndex < this.checkpoints.length && r.raw >= r.lapsDone + this.checkpoints[r.cpIndex]) {
        r.cpIndex++;
        if (r.isPlayer) this._emit('checkpoint', { index: r.cpIndex, time: this.time });
      }
      // lap completion requires all checkpoints
      if (r.cpIndex >= this.checkpoints.length && r.raw >= r.lapsDone + 1) {
        const lt = this.time - r.lapStart;
        r.lapTimes.push(lt);
        r.bestLap = r.bestLap == null ? lt : Math.min(r.bestLap, lt);
        r.lapStart = this.time;
        r.lapsDone++;
        r.cpIndex = 0;
        if (r.isPlayer) this._emit('lap', { lap: r.lapsDone, time: lt });
        if (this.type !== 'pursuit' && this.type !== 'knockout' && r.lapsDone >= this.totalLaps) this._finishRacer(r);
      }

      // wrong way (player): moving backward along the track
      if (r.isPlayer) {
        const spd = Math.abs(r.body.speed || 0);
        if (d < -1e-5 && spd > 2) r.wrongTimer += dt;
        else if (d > 1e-5) r.wrongTimer = Math.max(0, r.wrongTimer - dt * 2);
        const ww = r.wrongTimer > 1;
        if (ww !== this.wrongWay) { this.wrongWay = ww; this._emit('wrongWay', ww); }
        // stats
        const kmh = spd * 3.6;
        if (kmh > this.stats.topSpeed) this.stats.topSpeed = kmh;
        this.stats.distance += spd * dt;
        if (r.body.nitroActive || (this._nitroInput && r.body.nitro > 0)) this.stats.nitroTime += dt;
      }
    }
  }

  _finishRacer(r) {
    if (r.finished) return;
    r.finished = true;
    r.finishTime = this.time;
    this.finishOrder.push(r);
    if (r.isPlayer) this._finishRace();
  }

  _modeRules(dt) {
    const p = this.player;
    switch (this.type) {
      case 'drift': {
        const b = p.body;
        if (this._driftBase != null && typeof b.driftScore === 'number') {
          this.driftScore = Math.max(this.driftScore, b.driftScore - this._driftBase);
        } else if (b.drifting) {
          this.driftCombo = Math.min(5, this.driftCombo + dt * 0.5);
          this.driftScore += Math.abs(b.speed || 0) * dt * 25 * this.driftCombo;
        } else {
          this.driftCombo = Math.max(1, this.driftCombo - dt * 2);
        }
        break;
      }
      case 'knockout': {
        // Round k ends when all but one active racer have completed k laps; the remaining one is out.
        const active = this.activeRacers;
        if (active.length <= 1) break;
        const k = this.knockoutRound + 1;
        const done = active.filter(r => r.lapsDone >= k);
        if (done.length >= active.length - 1) {
          const out = active.find(r => r.lapsDone < k) || active.slice().sort((a, b) => a.raw - b.raw)[0];
          this.knockoutRound = k;
          this._eliminate(out);
          const left = this.activeRacers;
          if (out.isPlayer) this._finishRace();
          else if (left.length === 1) { this._finishRacer(left[0]); }
        }
        break;
      }
      case 'pursuit': {
        this.pursuitTime += dt;
        if (this.event.surviveTime && this.pursuitTime >= this.event.surviveTime) this._finishRace();
        break;
      }
      default: break;
    }
  }

  _eliminate(r) {
    r.eliminated = true;
    r.finishTime = this.time;
    this.eliminated.push(r);
    this._emit('eliminated', { name: r.name, isPlayer: r.isPlayer, round: this.knockoutRound });
  }

  notifyBusted() { if (this.state === 'racing') { this.busted = true; this._finishRace(); } }
  notifyEscaped() { if (this.state === 'racing') { this.escaped = true; this._finishRace(); } }
  setNitroInput(on) { this._nitroInput = on; }

  /** Ranking: finished (by order) > active (by progress) > eliminated (latest first). */
  _rank() {
    const fin = this.finishOrder;
    const active = this.racers.filter(r => !r.finished && !r.eliminated).sort((a, b) => b.raw - a.raw);
    const elim = this.eliminated.filter(r => !r.finished).slice().reverse();
    this.positions = [...fin, ...active, ...elim];
  }

  _finishRace() {
    if (this.state === 'finished') return;
    this._rank();
    this.state = 'finished';
    this.finished = true;
    const p = this.player;
    const place = this.positions.indexOf(p) + 1;
    // estimate times for unfinished rivals from their pace
    const standings = this.positions.map((r, i) => {
      let time = r.finishTime;
      if (time == null) {
        const prog = Math.max(0.01, r.raw);
        time = r.eliminated ? null : this.time * (this.totalLaps / prog);
      }
      return { name: r.name, isPlayer: r.isPlayer, place: i + 1, time, bestLap: r.bestLap, eliminated: r.eliminated };
    });
    const res = {
      eventId: this.event.id,
      type: this.type,
      place: this.type === 'pursuit' || this.type === 'drift' || this.type === 'timeTrial' ? (this.type === 'pursuit' ? null : 1) : place,
      time: p.finished ? p.finishTime : (this.type === 'pursuit' ? this.pursuitTime : null),
      lapTimes: p.lapTimes.slice(),
      bestLap: p.bestLap,
      score: Math.round(this.driftScore),
      survived: this.type === 'pursuit' && !this.busted && !!this.event.surviveTime && this.pursuitTime >= this.event.surviveTime,
      escaped: this.escaped,
      busted: this.busted,
      eliminated: p.eliminated,
      targetTime: this.event.targetTime || null,
      targetScore: this.event.targetScore || null,
      standings,
      stats: { ...this.stats, bestDrift: Math.round(this.driftScore), topSpeed: Math.round(this.stats.topSpeed) }
    };
    if (this.type === 'knockout' && !p.eliminated) res.place = 1;
    res.passed = isEventPassed(this.event, res);
    this.results = res;
    this._emit('finish', res);
  }

  /** Force-finish (e.g. quit or timeout) as DNF. */
  abort() {
    if (this.state === 'finished') return;
    this._finishRace();
    this.results.dnf = true;
    this.results.passed = false;
  }

  /** HUD-friendly snapshot. */
  hudState() {
    return {
      countdown: this.countdownText,
      position: this.playerPosition,
      racers: this.activeRacers.length,
      lap: this.lap,
      laps: this.totalLaps,
      time: this.time,
      lapTime: this.time - this.player.lapStart,
      bestLap: this.player.bestLap,
      wrongWay: this.wrongWay,
      driftScore: Math.round(this.driftScore),
      driftCombo: this.driftCombo,
      targetTime: this.event.targetTime,
      targetScore: this.event.targetScore,
      surviveLeft: this.event.surviveTime ? Math.max(0, this.event.surviveTime - this.pursuitTime) : null,
      mode: this.type,
      progress: this.player.raw
    };
  }
}
