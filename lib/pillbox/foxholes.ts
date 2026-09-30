import { LANES } from './types';

/** Shared by ground shaping, visible dugouts and infantry routes. */
export const FOXHOLES = LANES.map((x, lane) => ({
  id: lane,
  x: x + [-1.5, -4, 3.5, 4, 1.5][lane],
  z: -60 - (lane % 2),
  radius: 2.4,
  depth: 1.45,
}));

export function foxholeDepth(x: number, z: number): number {
  let height = 0;
  for (const hole of FOXHOLES) {
    const r = Math.hypot(x - hole.x, (z - hole.z) * 1.12) / hole.radius;
    if (r < 1.3) {
      const edge = Math.max(0, Math.min(1, (r - 0.45) / 0.55));
      height -= hole.depth * (1 - edge * edge * (3 - 2 * edge));
      height += 0.18 * Math.exp(-Math.pow((r - 1.04) / 0.16, 2));
    }
  }
  return height;
}
