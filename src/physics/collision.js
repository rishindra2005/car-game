// Velocity Rush — car vs car collision (circle push-apart + impulse).
// Bodies: { position:Vector3, velocity:Vector3, radius:number, mass:number } (VehiclePhysics qualifies).
// Works in the XZ plane. Returns impact speed (m/s along the normal) or 0 if no contact. No allocations.

const RESTITUTION = 0.25;
const FRICTION = 0.15;

export function resolveCarCollision(a, b) {
  const pa = a.position, pb = b.position;
  const dx = pb.x - pa.x, dz = pb.z - pa.z;
  const ra = a.radius ?? 2.2, rb = b.radius ?? 2.2;
  const minDist = ra + rb;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minDist * minDist) return 0;
  let d = Math.sqrt(d2);
  let nx, nz;
  if (d < 1e-6) { nx = 1; nz = 0; d = 0; } else { nx = dx / d; nz = dz / d; }
  const ma = a.mass ?? 1300, mb = b.mass ?? 1300;
  const invA = ma > 0 && isFinite(ma) ? 1 / ma : 0;
  const invB = mb > 0 && isFinite(mb) ? 1 / mb : 0;
  const invSum = invA + invB;
  if (invSum === 0) return 0;

  // positional correction (split by inverse mass)
  const pen = minDist - d;
  const ca = pen * invA / invSum, cb = pen * invB / invSum;
  pa.x -= nx * ca; pa.z -= nz * ca;
  pb.x += nx * cb; pb.z += nz * cb;

  // velocity impulse
  const va = a.velocity, vb = b.velocity;
  if (!va || !vb) return 0;
  const rvx = vb.x - va.x, rvz = vb.z - va.z;
  const vn = rvx * nx + rvz * nz;
  if (vn >= 0) return 0; // already separating
  const j = -(1 + RESTITUTION) * vn / invSum;
  va.x -= nx * j * invA; va.z -= nz * j * invA;
  vb.x += nx * j * invB; vb.z += nz * j * invB;
  // tangential friction
  const tx = -nz, tz = nx;
  const vt = rvx * tx + rvz * tz;
  let jt = -vt / invSum;
  const maxJt = FRICTION * j;
  if (jt > maxJt) jt = maxJt; else if (jt < -maxJt) jt = -maxJt;
  va.x -= tx * jt * invA; va.z -= tz * jt * invA;
  vb.x += tx * jt * invB; vb.z += tz * jt * invB;

  const impact = -vn;
  if (a.notifyImpact) a.notifyImpact(impact);
  if (b.notifyImpact) b.notifyImpact(impact);
  return impact;
}
