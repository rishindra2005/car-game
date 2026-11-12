// Career events. Track ids are provided by world/tracks.js.
export const EVENT_TYPES = ['circuit', 'sprint', 'drift', 'timeTrial', 'pursuit', 'knockout'];
export const TRACK_IDS = ['harbor-loop', 'downtown-grid', 'canyon-run', 'industrial-zone', 'skyline-sprint'];
export const CHAPTERS = [1, 2, 3, 4];

const ev = (o) => ({
  laps: 1, rivals: 0, requirements: {}, objectives: [], boss: null, targetTime: null, targetScore: null, surviveTime: null,
  ...o
});

export const EVENTS = [
  // ---------- ACT I : Harbor ----------
  ev({ id: 'a1-harbor-intro', name: 'Harbor Welcome', chapter: 1, type: 'circuit', trackId: 'harbor-loop', laps: 3, rivals: 5, difficulty: 0.25,
    reward: { money: 4000, rep: 100 }, requirements: {}, objectives: ['Finish in the top 3'] , winPlace: 3 }),
  ev({ id: 'a1-dock-sprint', name: 'Dockside Dash', chapter: 1, type: 'sprint', trackId: 'harbor-loop', laps: 1, rivals: 5, difficulty: 0.3,
    reward: { money: 5000, rep: 120 }, requirements: { events: ['a1-harbor-intro'] }, objectives: ['Finish 1st'], winPlace: 1 }),
  ev({ id: 'a1-crane-drift', name: 'Crane Yard Drift', chapter: 1, type: 'drift', trackId: 'industrial-zone', laps: 2, rivals: 0, difficulty: 0.3,
    reward: { money: 4500, rep: 110 }, requirements: { events: ['a1-harbor-intro'] }, objectives: ['Score 8,000 drift points'], targetScore: 8000 }),
  ev({ id: 'a1-tide-trial', name: 'Tide Clock', chapter: 1, type: 'timeTrial', trackId: 'harbor-loop', laps: 2, rivals: 0, difficulty: 0.35,
    reward: { money: 5000, rep: 120 }, requirements: { events: ['a1-dock-sprint'] }, objectives: ['Finish under 3:10'], targetTime: 190 }),
  ev({ id: 'a1-boss-vale', name: 'Sermon on the Loop', chapter: 1, type: 'circuit', trackId: 'harbor-loop', laps: 5, rivals: 3, difficulty: 0.5, boss: 'vale',
    reward: { money: 15000, rep: 400, car: null }, requirements: { events: ['a1-dock-sprint', 'a1-crane-drift', 'a1-tide-trial'] }, objectives: ['Beat Juno Vale', 'Finish 1st'], winPlace: 1 }),

  // ---------- ACT II : Downtown ----------
  ev({ id: 'a2-grid-circuit', name: 'Grid Tempo', chapter: 2, type: 'circuit', trackId: 'downtown-grid', laps: 3, rivals: 7, difficulty: 0.5,
    reward: { money: 8000, rep: 160 }, requirements: {}, objectives: ['Finish in the top 3'], winPlace: 3 }),
  ev({ id: 'a2-signal-knockout', name: 'Signal Knockout', chapter: 2, type: 'knockout', trackId: 'downtown-grid', laps: 4, rivals: 4, difficulty: 0.55,
    reward: { money: 10000, rep: 200 }, requirements: { events: ['a2-grid-circuit'] }, objectives: ['Avoid last place each lap', 'Be the last car standing'], winPlace: 1 }),
  ev({ id: 'a2-first-heat', name: 'First Heat', chapter: 2, type: 'pursuit', trackId: 'downtown-grid', laps: 99, rivals: 0, difficulty: 0.5,
    reward: { money: 9000, rep: 220 }, requirements: { events: ['a2-grid-circuit'] }, objectives: ['Survive 90 seconds or escape the Interceptors'], surviveTime: 90 }),
  ev({ id: 'a2-overpass-drift', name: 'Overpass Serenade', chapter: 2, type: 'drift', trackId: 'downtown-grid', laps: 2, rivals: 0, difficulty: 0.5,
    reward: { money: 8500, rep: 180 }, requirements: { events: ['a2-grid-circuit'] }, objectives: ['Score 14,000 drift points'], targetScore: 14000 }),
  ev({ id: 'a2-boss-kade', name: 'Final Movement', chapter: 2, type: 'circuit', trackId: 'downtown-grid', laps: 4, rivals: 3, difficulty: 0.65, boss: 'kade',
    reward: { money: 25000, rep: 600 }, requirements: { events: ['a2-signal-knockout', 'a2-first-heat', 'a2-overpass-drift'] }, objectives: ['Beat Kade Moreno', 'Finish 1st'], winPlace: 1 }),

  // ---------- ACT III : Canyon & Industrial ----------
  ev({ id: 'a3-canyon-sprint', name: 'Canyon Descent', chapter: 3, type: 'sprint', trackId: 'canyon-run', laps: 1, rivals: 5, difficulty: 0.65,
    reward: { money: 14000, rep: 250 }, requirements: {}, objectives: ['Finish 1st'], winPlace: 1 }),
  ev({ id: 'a3-switchback-drift', name: 'Switchback Smoke', chapter: 3, type: 'drift', trackId: 'canyon-run', laps: 2, rivals: 0, difficulty: 0.65,
    reward: { money: 13000, rep: 240 }, requirements: {}, objectives: ['Score 20,000 drift points'], targetScore: 20000 }),
  ev({ id: 'a3-foundry-knockout', name: 'Foundry Knockout', chapter: 3, type: 'knockout', trackId: 'industrial-zone', laps: 5, rivals: 5, difficulty: 0.7,
    reward: { money: 16000, rep: 280 }, requirements: { events: ['a3-canyon-sprint'] }, objectives: ['Be the last car standing'], winPlace: 1 }),
  ev({ id: 'a3-foundry-escape', name: 'Ledger Run', chapter: 3, type: 'pursuit', trackId: 'industrial-zone', laps: 99, rivals: 0, difficulty: 0.7,
    reward: { money: 15000, rep: 300 }, requirements: { events: ['a3-switchback-drift'] }, objectives: ['Survive 120 seconds or escape'], surviveTime: 120 }),
  ev({ id: 'a3-boss-sable', name: 'Raven\'s Bargain', chapter: 3, type: 'circuit', trackId: 'canyon-run', laps: 3, rivals: 3, difficulty: 0.8, boss: 'sable',
    reward: { money: 40000, rep: 900 }, requirements: { events: ['a3-foundry-knockout', 'a3-foundry-escape'] }, objectives: ['Beat Sable Ishikawa', 'Finish 1st'], winPlace: 1 }),

  // ---------- ACT IV : Skyline ----------
  ev({ id: 'a4-skyline-trial', name: 'Lio\'s Line', chapter: 4, type: 'timeTrial', trackId: 'skyline-sprint', laps: 1, rivals: 0, difficulty: 0.8,
    reward: { money: 20000, rep: 300 }, requirements: {}, objectives: ['Finish under 1:35'], targetTime: 95 }),
  ev({ id: 'a4-crew-summit', name: 'Crew Summit', chapter: 4, type: 'circuit', trackId: 'skyline-sprint', laps: 3, rivals: 7, difficulty: 0.85,
    reward: { money: 30000, rep: 500 }, requirements: { events: ['a4-skyline-trial'] }, objectives: ['Finish 1st against all crew champions'], winPlace: 1 }),
  ev({ id: 'a4-interceptor-gauntlet', name: 'Interceptor Gauntlet', chapter: 4, type: 'pursuit', trackId: 'skyline-sprint', laps: 99, rivals: 0, difficulty: 0.9,
    reward: { money: 30000, rep: 600 }, requirements: { events: ['a4-skyline-trial'] }, objectives: ['Survive 150 seconds at heat 5 or escape'], surviveTime: 150 }),
  ev({ id: 'a4-boss-harrow', name: 'The Schedule Breaks', chapter: 4, type: 'sprint', trackId: 'skyline-sprint', laps: 1, rivals: 1, difficulty: 0.95, boss: 'harrow',
    reward: { money: 100000, rep: 2000 }, requirements: { events: ['a4-crew-summit', 'a4-interceptor-gauntlet'] }, objectives: ['Beat Commissioner Harrow', 'Finish 1st'], winPlace: 1 }),

  // ---------- Side events (any chapter once unlocked) ----------
  ev({ id: 's-midnight-knockout', name: 'Midnight Knockout', chapter: 2, type: 'knockout', trackId: 'harbor-loop', laps: 4, rivals: 4, difficulty: 0.45, side: true,
    reward: { money: 7000, rep: 120 }, requirements: {}, objectives: ['Be the last car standing'], winPlace: 1 }),
  ev({ id: 's-industrial-trial', name: 'Foundry Clock', chapter: 3, type: 'timeTrial', trackId: 'industrial-zone', laps: 2, rivals: 0, difficulty: 0.6, side: true,
    reward: { money: 9000, rep: 150 }, requirements: {}, objectives: ['Finish under 2:40'], targetTime: 160 })
];

export const ACT_BOSSES = {
  1: { characterId: 'vale', name: 'Juno Vale', crew: 'Tidewater Saints', eventId: 'a1-boss-vale', carClass: 'C' },
  2: { characterId: 'kade', name: 'Kade "Gridlock" Moreno', crew: 'Circuit Choir', eventId: 'a2-boss-kade', carClass: 'B' },
  3: { characterId: 'sable', name: 'Sable Ishikawa', crew: 'Dust Ravens', eventId: 'a3-boss-sable', carClass: 'A' },
  4: { characterId: 'harrow', name: 'Commissioner Elias Harrow', crew: 'Harbor Interceptor Unit', eventId: 'a4-boss-harrow', carClass: 'S' }
};

export function getEvent(id) { return EVENTS.find(e => e.id === id) || null; }
export function eventsForChapter(ch) { return EVENTS.filter(e => e.chapter === ch); }

/** Did the player "win" (pass) this event? results: { place, time, score, survived, escaped, eliminated } */
export function isEventPassed(event, results) {
  if (!results || results.dnf || results.eliminated || results.busted) return false;
  switch (event.type) {
    case 'drift': return (results.score || 0) >= (event.targetScore || 0);
    case 'timeTrial': return results.time != null && results.time <= event.targetTime;
    case 'pursuit': return !!(results.survived || results.escaped);
    default: return results.place != null && results.place <= (event.winPlace || 1);
  }
}

/** Reward scaled by placement (1st 100%, 2nd 60%, 3rd 40%, else 15%); non-race types full if passed. */
export function computeReward(event, results) {
  const passed = isEventPassed(event, results);
  let mult;
  if (['drift', 'timeTrial', 'pursuit'].includes(event.type)) mult = passed ? 1 : 0.1;
  else mult = [1, 0.6, 0.4][(results.place || 99) - 1] ?? 0.15;
  if (results.eliminated || results.busted) mult = 0.1;
  return { money: Math.round(event.reward.money * mult), rep: Math.round(event.reward.rep * mult), passed };
}
