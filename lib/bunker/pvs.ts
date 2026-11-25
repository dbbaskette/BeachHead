import * as T from 'three';
import { rooms, type Door } from './simulation';

type Axis = 'x' | 'z';

type PortalEdge = {
  to: number;
  axis: Axis;
  door?: number;
};

/** 12-room bunker connectivity matching `rooms`, `passages`, and `doorLayouts`. */
const GRAPH: Readonly<Record<number, readonly PortalEdge[]>> = {
  0: [{ to: 1, axis: 'z' }],
  1: [
    { to: 0, axis: 'z' },
    { to: 2, axis: 'z' },
  ],
  2: [
    { to: 1, axis: 'z' },
    { to: 3, axis: 'z', door: 0 },
    { to: 7, axis: 'x' },
  ],
  3: [
    { to: 2, axis: 'z', door: 0 },
    { to: 4, axis: 'z', door: 1 },
  ],
  4: [
    { to: 3, axis: 'z', door: 1 },
    { to: 5, axis: 'z' },
    { to: 10, axis: 'x' },
  ],
  5: [
    { to: 4, axis: 'z' },
    { to: 6, axis: 'z', door: 2 },
  ],
  6: [{ to: 5, axis: 'z', door: 2 }],
  7: [
    { to: 2, axis: 'x' },
    { to: 8, axis: 'x' },
  ],
  8: [
    { to: 7, axis: 'x' },
    { to: 9, axis: 'z', door: 3 },
  ],
  9: [
    { to: 8, axis: 'z', door: 3 },
    { to: 10, axis: 'x' },
    { to: 11, axis: 'z', door: 4 },
  ],
  10: [
    { to: 9, axis: 'x' },
    { to: 4, axis: 'x' },
  ],
  11: [{ to: 9, axis: 'z', door: 4 }],
};

/** Resolve any world XZ position to a room index in `0..11`. */
export function roomIndexAt(x: number, z: number): number {
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) return i;
  }
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Compute rooms potentially visible from `playerRoom`, stopping strictly at closed
 * blast doors and allowing straight sightlines plus at most one orthogonal corner.
 */
export function visibleRooms(
  playerRoom: number,
  doors: Pick<Door, 'progress'>[],
): Set<number> {
  const visible = new Set<number>([playerRoom]);
  const visitedStates = new Set<string>();
  const queue: Array<{ room: number; axis: Axis | null; turns: number }> = [
    { room: playerRoom, axis: null, turns: 0 },
  ];
  for (let head = 0; head < queue.length; head++) {
    const { room, axis, turns } = queue[head];
    const edges = GRAPH[room];
    if (!edges) continue;
    for (const edge of edges) {
      if (edge.door !== undefined && (doors[edge.door]?.progress ?? 0) <= 0.02)
        continue;
      const nextTurns = axis === null || axis === edge.axis ? turns : turns + 1;
      if (nextTurns > 1) continue;
      visible.add(edge.to);
      const stateKey = `${edge.to}:${edge.axis}:${nextTurns}`;
      if (!visitedStates.has(stateKey)) {
        visitedStates.add(stateKey);
        queue.push({ room: edge.to, axis: edge.axis, turns: nextTurns });
      }
    }
  }
  return visible;
}

/** Map a world-space bounding box to all overlapping bunker room indices. */
export function roomsOverlappingBox(box: T.Box3, pad = 0.75): number[] {
  const overlapping: number[] = [];
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (
      box.max.x >= r.x - r.w / 2 - pad &&
      box.min.x <= r.x + r.w / 2 + pad &&
      box.max.z >= r.z - r.d / 2 - pad &&
      box.min.z <= r.z + r.d / 2 + pad
    ) {
      overlapping.push(i);
    }
  }
  return overlapping;
}
