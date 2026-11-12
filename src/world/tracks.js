// Track definitions for Velocity Rush. All names/districts are fictional.
// controlPoints are [x, z] in meters (Y is derived from a smooth elevation field, see track.js).
// `biome` ('city'|'coast'|'canyon'|'industrial') selects the scenery dressing in city.js.
// `elevation` = amplitude (m) of the gentle terrain field, `seed` varies its phase.

export const TRACKS = [
  {
    id: 'harbor-loop',
    name: 'Saltgate Harbor Loop',
    district: 'Saltgate Docks',
    laps: 3,
    width: 14,
    timeOfDay: 'day',
    biome: 'coast',
    elevation: 3,
    seed: 1,
    controlPoints: [
      [0, 0], [180, -30], [360, -10], [470, 90], [480, 240], [400, 360],
      [240, 400], [90, 360], [-30, 280], [-60, 160], [-60, 60],
    ],
  },
  {
    id: 'canyon-run',
    name: 'Lumen Canyon Climb',
    district: 'Lumen Heights',
    laps: 3,
    width: 13,
    timeOfDay: 'dusk',
    biome: 'canyon',
    elevation: 7,
    seed: 2,
    controlPoints: [
      [0, 0], [220, 40], [420, 0], [580, 120], [600, 320], [480, 460],
      [300, 420], [200, 300], [60, 360], [-120, 420], [-260, 300], [-240, 120], [-120, 20],
    ],
  },
  {
    id: 'downtown-grid',
    name: 'Cobalt Grid Sprint',
    district: 'Cobalt Quarter',
    laps: 2,
    width: 15,
    timeOfDay: 'rain',
    biome: 'city',
    elevation: 2,
    seed: 3,
    controlPoints: [
      [0, 0], [300, 0], [600, 10], [800, 0], [880, 120], [820, 260],
      [600, 280], [520, 420], [560, 600], [420, 700], [200, 660], [140, 480],
      [-60, 420], [-200, 320], [-180, 140], [-100, 30],
    ],
  },
  {
    id: 'industrial-zone',
    name: 'Ember Row Foundry Esses',
    district: 'Ember Row',
    laps: 3,
    width: 12,
    timeOfDay: 'dusk',
    biome: 'industrial',
    elevation: 4,
    seed: 4,
    controlPoints: [
      [0, 0], [120, -60], [260, -20], [340, 80], [460, 100], [560, 20],
      [660, 80], [640, 220], [520, 300], [380, 260], [260, 340], [120, 300],
      [20, 200], [-60, 90],
    ],
  },
  {
    id: 'skyline-sprint',
    name: 'Verdant Skyline Sprint',
    district: 'Verdant Ring',
    laps: 2,
    width: 16,
    timeOfDay: 'day',
    biome: 'city',
    elevation: 6,
    seed: 5,
    controlPoints: [
      [0, 0], [260, -80], [540, -60], [760, 60], [860, 280], [800, 520],
      [600, 660], [340, 700], [100, 620], [-80, 460], [-140, 240],
    ],
  },
  {
    id: 'glasswater-bay',
    name: 'Glasswater Causeway',
    district: 'Glasswater Bay',
    laps: 3,
    width: 14,
    timeOfDay: 'night',
    biome: 'coast',
    elevation: 2,
    seed: 6,
    controlPoints: [
      [0, 0], [400, -20], [700, 40], [760, 180], [640, 280], [360, 260],
      [120, 300], [-80, 220], [-110, 90],
    ],
  },
];

export function getTrackDef(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
