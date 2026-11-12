// Fictional car catalog for Velocity Rush. All names are original.
// spec: { mass (kg), power (kW), maxSpeed (m/s), grip (~0.8..1.4), wheelbase (m), drag, gears[] }

export const CLASSES = ['D', 'C', 'B', 'A', 'S'];

export const CARS = [
  { id: 'pip', name: 'Pipsqueak GT', class: 'D', price: 8000, color: 0xf2c12e, bodyStyle: 'hatch',
    spec: { mass: 1050, power: 85, maxSpeed: 52, grip: 0.92, wheelbase: 2.45, drag: 0.34, gears: [3.4, 2.1, 1.45, 1.1, 0.88] } },
  { id: 'brick', name: 'Ironhide Ranger', class: 'D', price: 11000, color: 0x4a6b3a, bodyStyle: 'suv',
    spec: { mass: 1850, power: 140, maxSpeed: 55, grip: 0.86, wheelbase: 2.8, drag: 0.42, gears: [3.6, 2.2, 1.5, 1.12, 0.9] } },
  { id: 'comet', name: 'Comet Sprint', class: 'C', price: 18000, color: 0x2e7dd7, bodyStyle: 'hatch',
    spec: { mass: 1180, power: 150, maxSpeed: 61, grip: 1.0, wheelbase: 2.55, drag: 0.32, gears: [3.3, 2.15, 1.55, 1.2, 0.98, 0.82] } },
  { id: 'vandal', name: 'Vandal Strike', class: 'C', price: 24000, color: 0xb3261e, bodyStyle: 'muscle',
    spec: { mass: 1600, power: 245, maxSpeed: 66, grip: 0.95, wheelbase: 2.75, drag: 0.36, gears: [3.0, 1.95, 1.4, 1.05, 0.82] } },
  { id: 'kestrel', name: 'Kestrel RS', class: 'B', price: 38000, color: 0xe8e8ec, bodyStyle: 'coupe',
    spec: { mass: 1320, power: 280, maxSpeed: 72, grip: 1.08, wheelbase: 2.6, drag: 0.3, gears: [3.2, 2.1, 1.55, 1.22, 1.0, 0.84] } },
  { id: 'thunder', name: 'Thunderclap 77', class: 'B', price: 45000, color: 0x15161a, bodyStyle: 'muscle',
    spec: { mass: 1720, power: 360, maxSpeed: 75, grip: 1.0, wheelbase: 2.8, drag: 0.35, gears: [2.9, 1.9, 1.38, 1.05, 0.85, 0.7] } },
  { id: 'nightjar', name: 'Nightjar Vector', class: 'A', price: 78000, color: 0x5b2a86, bodyStyle: 'coupe',
    spec: { mass: 1420, power: 430, maxSpeed: 82, grip: 1.16, wheelbase: 2.62, drag: 0.29, gears: [3.1, 2.15, 1.6, 1.27, 1.04, 0.87] } },
  { id: 'halcyon', name: 'Halcyon Apex', class: 'A', price: 96000, color: 0x0f8f7a, bodyStyle: 'super',
    spec: { mass: 1380, power: 500, maxSpeed: 86, grip: 1.2, wheelbase: 2.65, drag: 0.28, gears: [3.2, 2.2, 1.65, 1.3, 1.06, 0.88, 0.75] } },
  { id: 'zenith', name: 'Zenith Phantom X', class: 'S', price: 185000, color: 0xff6a00, bodyStyle: 'super',
    spec: { mass: 1310, power: 640, maxSpeed: 94, grip: 1.28, wheelbase: 2.7, drag: 0.27, gears: [3.3, 2.3, 1.72, 1.36, 1.1, 0.92, 0.78] } },
  { id: 'aurora', name: 'Aurora Eclipse', class: 'S', price: 240000, color: 0x9fd8ff, bodyStyle: 'super',
    spec: { mass: 1260, power: 720, maxSpeed: 99, grip: 1.34, wheelbase: 2.68, drag: 0.26, gears: [3.4, 2.35, 1.75, 1.38, 1.12, 0.94, 0.8] } },
];

export function getCar(id) {
  return CARS.find((c) => c.id === id) || null;
}

// Each level's multipliers are cumulative-free: level N uses levels[N-1] (level 0 = stock).
export const UPGRADES = {
  engine: { name: 'Engine', levels: [
    { price: 4000, mult: { power: 1.08, maxSpeed: 1.02 } },
    { price: 9000, mult: { power: 1.17, maxSpeed: 1.04 } },
    { price: 18000, mult: { power: 1.28, maxSpeed: 1.06 } },
  ] },
  tires: { name: 'Tires', levels: [
    { price: 2500, mult: { grip: 1.05 } },
    { price: 6000, mult: { grip: 1.1 } },
    { price: 12000, mult: { grip: 1.16 } },
  ] },
  nitro: { name: 'Nitro', levels: [
    { price: 3000, mult: { nitroPower: 1.15, nitroCapacity: 1.2 } },
    { price: 7000, mult: { nitroPower: 1.3, nitroCapacity: 1.4 } },
    { price: 14000, mult: { nitroPower: 1.5, nitroCapacity: 1.65 } },
  ] },
  weight: { name: 'Weight Reduction', levels: [
    { price: 3500, mult: { mass: 0.96, power: 1.01 } },
    { price: 8000, mult: { mass: 0.92, power: 1.02 } },
    { price: 15000, mult: { mass: 0.88, power: 1.03 } },
  ] },
};

/**
 * Pure: returns a NEW spec with upgrade multipliers applied.
 * @param {object} spec base spec
 * @param {{engine?:number,tires?:number,nitro?:number,weight?:number}} upgrades levels (0 = stock)
 */
export function applyUpgrades(spec, upgrades = {}) {
  const out = { ...spec, gears: spec.gears ? spec.gears.slice() : [] };
  if (out.nitroPower == null) out.nitroPower = 1;
  if (out.nitroCapacity == null) out.nitroCapacity = 1;
  for (const key of Object.keys(UPGRADES)) {
    const lvl = Math.max(0, Math.min(UPGRADES[key].levels.length, Math.floor((upgrades && upgrades[key]) || 0)));
    if (!lvl) continue;
    const mult = UPGRADES[key].levels[lvl - 1].mult;
    for (const k in mult) out[k] = (out[k] ?? 1) * mult[k];
  }
  return out;
}

export function upgradePrice(type, level) {
  const u = UPGRADES[type];
  return u && u.levels[level - 1] ? u.levels[level - 1].price : Infinity;
}
