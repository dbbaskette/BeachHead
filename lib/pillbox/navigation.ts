import { COVER_ROWS, LANES } from './types';

export type BeachObstacle = {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  kind: 'steel' | 'cover' | 'wire';
};
export type RoutePoint = { x: number; z: number; cover?: boolean };
// Rendering and routing share these footprints; padding includes a soldier's body.
export const BEACH_OBSTACLES: BeachObstacle[] = [
  ...Array.from({ length: 20 }, (_, i) => ({
    x: -47 + (i % 10) * 10.4,
    z: -103 - Math.floor(i / 10) * 20,
    halfX: 2.2,
    halfZ: 2.2,
    kind: 'steel' as const,
  })),
  ...[-54, -27, -9, 9, 27, 54].map((x) => ({
    x,
    z: -70.5,
    halfX: 4,
    halfZ: 3.5,
    kind: 'wire' as const,
  })),
  ...COVER_ROWS.flatMap((z) =>
    LANES.map((x) => ({ x, z, halfX: 4, halfZ: 0.75, kind: 'cover' as const })),
  ),
];
const CLEARANCE = 0.7;

export function clearSegment(a: RoutePoint, b: RoutePoint): boolean {
  return BEACH_OBSTACLES.every((o) => {
    let enter = 0,
      leave = 1;
    for (const [start, delta, low, high] of [
      [a.x, b.x - a.x, o.x - o.halfX - CLEARANCE, o.x + o.halfX + CLEARANCE],
      [a.z, b.z - a.z, o.z - o.halfZ - CLEARANCE, o.z + o.halfZ + CLEARANCE],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (start <= low || start >= high) return true;
      } else {
        const t1 = (low - start) / delta,
          t2 = (high - start) / delta;
        enter = Math.max(enter, Math.min(t1, t2));
        leave = Math.min(leave, Math.max(t1, t2));
      }
    }
    return enter >= leave;
  });
}
const corners = BEACH_OBSTACLES.flatMap((o) =>
  [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => ({
      x: o.x + sx * (o.halfX + CLEARANCE + 0.08),
      z: o.z + sz * (o.halfZ + CLEARANCE + 0.08),
    })),
  ),
);
let edges: number[][] | undefined;
function path(a: RoutePoint, b: RoutePoint): RoutePoint[] {
  edges ??= corners.map((p, i) =>
    corners.map((q, j) =>
      i !== j && clearSegment(p, q)
        ? Math.hypot(p.x - q.x, p.z - q.z)
        : Infinity,
    ),
  );
  const points = [...corners, a, b],
    start = points.length - 2,
    end = start + 1;
  const distances = points.map(() => Infinity),
    previous = points.map(() => -1),
    visited = new Set<number>();
  distances[start] = 0;
  while (!visited.has(end)) {
    let current = -1;
    for (let i = 0; i < points.length; i++)
      if (!visited.has(i) && (current < 0 || distances[i] < distances[current]))
        current = i;
    if (current < 0 || !Number.isFinite(distances[current]))
      throw new Error('Beach route is blocked');
    visited.add(current);
    for (let i = 0; i < points.length; i++) {
      if (visited.has(i)) continue;
      const cost =
        current < start && i < start
          ? edges[current][i]
          : clearSegment(points[current], points[i])
            ? Math.hypot(
                points[current].x - points[i].x,
                points[current].z - points[i].z,
              )
            : Infinity;
      if (distances[current] + cost < distances[i]) {
        distances[i] = distances[current] + cost;
        previous[i] = current;
      }
    }
  }
  const result: RoutePoint[] = [];
  for (let i = end; i !== start; i = previous[i]) result.unshift(points[i]);
  return result;
}
const routes = new Map<string, RoutePoint[]>();
export function infantryRoute(lane: number, offset: number): RoutePoint[] {
  const key = `${lane}:${offset}`;
  let route = routes.get(key);
  if (!route) {
    let from: RoutePoint = { x: LANES[lane] + offset, z: -132 };
    route = [];
    for (const z of COVER_ROWS) {
      const to = { x: LANES[lane] + offset, z: z - 2.1, cover: true };
      route.push(...path(from, to));
      from = to;
    }
    route.push(...path(from, { x: offset * 0.5, z: -12 }));
    routes.set(key, route);
  }
  return route;
}
