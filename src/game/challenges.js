// Side challenges evaluated from a stats object.
// stats: { topSpeed (km/h), bestDrift, totalDrift, escapes, wins, races, distance (m), nitroTime (s), cleanLaps, maxHeat, nearMisses }

export const CHALLENGES = [
  { id: 'speed-200', name: 'Redline Rookie', desc: 'Reach 200 km/h', stat: 'topSpeed', target: 200, reward: 2000, daily: false },
  { id: 'speed-280', name: 'Harbor Missile', desc: 'Reach 280 km/h', stat: 'topSpeed', target: 280, reward: 8000, daily: false },
  { id: 'speed-330', name: 'Skyline Bullet', desc: 'Reach 330 km/h', stat: 'topSpeed', target: 330, reward: 20000, daily: false },
  { id: 'drift-20k', name: 'Smoke Signal', desc: 'Score 20,000 drift points in one event', stat: 'bestDrift', target: 20000, reward: 6000, daily: false },
  { id: 'drift-50k', name: 'Raven Feather', desc: 'Score 50,000 drift points in one event', stat: 'bestDrift', target: 50000, reward: 15000, daily: false },
  { id: 'escape-3', name: 'Ghost Protocol', desc: 'Escape the Interceptors 3 times', stat: 'escapes', target: 3, reward: 9000, daily: false },
  { id: 'wins-10', name: 'Crew Favourite', desc: 'Win 10 events', stat: 'wins', target: 10, reward: 10000, daily: false },
  { id: 'distance-100k', name: 'Long Night', desc: 'Drive 100 km total', stat: 'distance', target: 100000, reward: 7000, daily: false },
  { id: 'nitro-120', name: 'Bottled Lightning', desc: 'Use 120 s of nitro', stat: 'nitroTime', target: 120, reward: 4000, daily: false },
  { id: 'clean-10', name: 'Clean Lines', desc: 'Complete 10 laps without wall contact', stat: 'cleanLaps', target: 10, reward: 5000, daily: false },
  // daily rotation pool
  { id: 'daily-drift', name: 'Daily: Sideways', desc: 'Score 10,000 drift points', stat: 'bestDrift', target: 10000, reward: 3000, daily: true },
  { id: 'daily-speed', name: 'Daily: Top End', desc: 'Reach 250 km/h', stat: 'topSpeed', target: 250, reward: 3000, daily: true },
  { id: 'daily-race', name: 'Daily: Show Up', desc: 'Complete 3 races', stat: 'races', target: 3, reward: 2500, daily: true },
  { id: 'daily-nitro', name: 'Daily: Boost Junkie', desc: 'Use 30 s of nitro', stat: 'nitroTime', target: 30, reward: 2500, daily: true }
];

/** Evaluate a challenge -> { id, value, target, progress 0..1, complete } */
export function evaluateChallenge(ch, stats = {}) {
  const value = Number(stats[ch.stat]) || 0;
  const progress = Math.max(0, Math.min(1, value / ch.target));
  return { id: ch.id, name: ch.name, value, target: ch.target, progress, complete: value >= ch.target };
}

export function evaluateAll(stats, list = CHALLENGES) {
  return list.map(c => evaluateChallenge(c, stats));
}

/** Deterministic daily picks (2) from pool based on the date. */
export function dailyChallenges(date = new Date()) {
  const pool = CHALLENGES.filter(c => c.daily);
  const day = Math.floor(date.getTime() / 86400000);
  const a = day % pool.length;
  const b = (a + 1 + (day % (pool.length - 1))) % pool.length;
  return a === b ? [pool[a]] : [pool[a], pool[b]];
}

/** Newly completed challenge ids given claimed set. */
export function newlyCompleted(stats, claimed = [], list = CHALLENGES) {
  return evaluateAll(stats, list).filter(r => r.complete && !claimed.includes(r.id)).map(r => r.id);
}
