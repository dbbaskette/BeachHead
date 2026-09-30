import type { EnemyShip, ShellPoint } from './simulation';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Resolve the salvo footprint onto the deck; keep the hit in ship-local coordinates. */
export function shipImpactSite(
  ship: EnemyShip,
  x: number,
  z: number,
): ShellPoint {
  const dx = x - ship.x,
    dz = z - ship.z;
  const localZ = clamp(
    -dx * Math.sin(ship.heading) + dz * Math.cos(ship.heading),
    -ship.length * 0.48,
    ship.length * 0.43,
  );
  const taper =
    localZ < -ship.length * 0.1
      ? clamp((localZ + ship.length * 0.53) / (ship.length * 0.3), 0.13, 1)
      : 1;
  return {
    x: clamp(
      dx * Math.cos(ship.heading) + dz * Math.sin(ship.heading),
      -ship.width * 0.46 * taper,
      ship.width * 0.46 * taper,
    ),
    y: 6.5,
    z: localZ,
  };
}

/** The damaged side and end flood first; settle, list, then slip beneath the surface. */
export function sinkingPose(age: number, length: number, hit: ShellPoint) {
  const progress = clamp(age / 18, 0, 1);
  const flood = progress * progress * (3 - 2 * progress);
  return {
    y: -length * 0.9 * Math.pow(progress, 3.2),
    roll:
      -(Math.sign(hit.x) || 1) * (0.08 * Math.min(age / 2, 1) + 0.85 * flood),
    pitch: (Math.sign(hit.z) || -1) * 0.32 * flood,
    visible: age < 18,
  };
}
