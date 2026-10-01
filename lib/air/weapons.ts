import type { Aircraft, AirBattle, AirTarget, Projectile, Vec3 } from './types';
import { GUNS, RACKS, hardpoint, rotate, mix } from './flight';
import { targetFuture, terrainHeight } from './targets';
export const GRAVITY = 9.81;
export const CONVERGENCE = { x: 0, y: -155, z: -500 };
export function gunSolutions(f: Aircraft) {
  const converge = hardpoint(f, CONVERGENCE);
  return GUNS.map((local) => {
    const origin = hardpoint(f, local),
      d = {
        x: converge.x - origin.x,
        y: converge.y - origin.y,
        z: converge.z - origin.z,
      };
    const l = Math.hypot(d.x, d.y, d.z);
    return {
      origin,
      velocity: {
        x: (d.x / l) * 640 + f.velocity.x,
        y: (d.y / l) * 640 + f.velocity.y,
        z: (d.z / l) * 640 + f.velocity.z,
      },
    };
  });
}
export function bombSolution(f: Aircraft, rack: number) {
  return { origin: hardpoint(f, RACKS[rack % 2]), velocity: { ...f.velocity } };
}
export function projectilePoint(
  p: Pick<Projectile, 'origin' | 'velocity'>,
  age: number,
): Vec3 {
  return {
    x: p.origin.x + p.velocity.x * age,
    y: p.origin.y + p.velocity.y * age - 0.5 * GRAVITY * age * age,
    z: p.origin.z + p.velocity.z * age,
  };
}
function boxHit(a: Vec3, b: Vec3, t: AirTarget, start: Vec3, end: Vec3) {
  let low = 0,
    high = 1;
  for (const key of ['x', 'y', 'z'] as const) {
    const offset = key === 'y' ? t.half.y : 0;
    const from = a[key] - start[key] - offset,
      delta = b[key] - end[key] - offset - from;
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(from) > t.half[key]) return null;
      continue;
    }
    const u = (-t.half[key] - from) / delta,
      v = (t.half[key] - from) / delta;
    low = Math.max(low, Math.min(u, v));
    high = Math.min(high, Math.max(u, v));
    if (low > high) return null;
  }
  return low;
}
export type SurfaceHit = {
  position: Vec3;
  target?: AirTarget;
  water: boolean;
  fraction: number;
};
/** Earliest swept intersection, including target motion over the segment. */
export function firstSurface(
  a: Vec3,
  b: Vec3,
  targets: AirTarget[],
  future = 0,
  dt = 0,
): SurfaceHit | null {
  let best = 2,
    target: AirTarget | undefined;
  for (const t of targets) {
    if (
      !t.active ||
      (t.health <= 0 && ['craft', 'carrier', 'command'].includes(t.kind))
    )
      continue;
    const start = targetFuture(t, Math.max(0, future - dt)),
      end = targetFuture(t, future);
    const hit = boxHit(a, b, t, start, end);
    if (hit !== null && hit < best) {
      best = hit;
      target = t;
    }
  }
  const at = (t: number) => ({
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    z: mix(a.z, b.z, t),
  });
  const above = (t: number) => {
    const p = at(t);
    return p.y - terrainHeight(p.x, p.z);
  };
  let previous = 0;
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    if (above(f) <= 0) {
      let lo = previous,
        hi = f;
      for (let j = 0; j < 12; j++) {
        const mid = (lo + hi) / 2;
        if (above(mid) > 0) lo = mid;
        else hi = mid;
      }
      if (hi < best) {
        best = hi;
        target = undefined;
      }
      break;
    }
    previous = f;
  }
  if (best > 1) return null;
  const position = at(best);
  return {
    position,
    target,
    water: !target && terrainHeight(position.x, position.z) === 0,
    fraction: best,
  };
}
export function predictImpact(
  solution: Pick<Projectile, 'origin' | 'velocity'>,
  targets: AirTarget[],
  max = 12,
) {
  let a = solution.origin;
  for (let age = 1 / 30; age <= max; age += 1 / 30) {
    const b = projectilePoint(solution, age),
      hit = firstSurface(a, b, targets, age, 1 / 30);
    if (hit) return hit;
    a = b;
  }
  return null;
}
export function gunAim(f: Aircraft) {
  const dir = rotate(CONVERGENCE, f);
  return {
    x: f.position.x + dir.x,
    y: f.position.y + dir.y,
    z: f.position.z + dir.z,
  };
}
export function releaseBomb(b: AirBattle) {
  if (
    b.status !== 'playing' ||
    b.phase !== 'attack' ||
    b.bombs <= 0 ||
    b.bombCooldown > 0
  )
    return null;
  const rack = b.released % 2,
    solution = bombSolution(b.aircraft, rack);
  const p: Projectile = {
    ...solution,
    position: { ...solution.origin },
    id: ++b.serial,
    kind: 'bomb',
    age: 0,
    life: 12,
    rack,
  };
  b.projectiles.push(p);
  b.bombs--;
  b.released++;
  b.bombCooldown = 0.55;
  return p;
}
