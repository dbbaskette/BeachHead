export type Point = { x: number; y: number; z: number };
export type Cover = Point & {
  id: number;
  kind: 'house' | 'wall' | 'fence' | 'hedge';
  w: number;
  h: number;
  d: number;
  health: number;
  maxHealth: number;
};
export type EnemyKind = 'rocket' | 'gun' | 'tank' | 'demolition';
export type EnemySeed = Point & {
  kind: EnemyKind;
  yaw: number;
  reserve?: boolean;
};
export const BRIDGE = { x: 0, z: -307 };
export const SUPPLY = { x: -43, z: -172 };
export function village(): Cover[] {
  const rows: Cover[] = [];
  const add = (
    kind: Cover['kind'],
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    health: number,
  ) =>
    rows.push({
      id: rows.length + 1,
      kind,
      x,
      y: h / 2,
      z,
      w,
      d,
      h,
      health,
      maxHealth: health,
    });
  // The high street and western orchard lane meet in the bridge square.
  for (const [x, z, w, d, h] of [
    [-24, -49, 17, 22, 8],
    [25, -53, 18, 26, 9],
    [-24, -96, 17, 23, 9],
    [25, -104, 18, 24, 7],
    [-24, -144, 17, 24, 7],
    [25, -153, 18, 25, 9],
    [-24, -200, 17, 25, 9],
    [25, -210, 18, 25, 8],
    [-28, -254, 18, 24, 10],
    [29, -259, 20, 25, 8],
    [-62, -93, 13, 18, 6],
    [-62, -224, 14, 24, 7],
  ])
    add('house', x, z, w, d, h, 230);
  for (const [x, z, w, d] of [
    [-12, -30, 18, 1.1],
    [9, -85, 12, 1.1],
    [-12, -125, 14, 1.1],
    [11, -183, 13, 1.1],
    [-12, -237, 15, 1.1],
    [20, -282, 21, 1.1],
    [-45, -120, 15, 1],
  ])
    add('wall', x, z, w, d, 1.35, 75);
  for (const z of [-58, -153, -212]) add('fence', -44, z, 17, 0.35, 1.1, 18);
  for (const z of [-42, -83, -134, -195, -248])
    add('hedge', -74, z, 5, 34, 3, 99999);
  return rows;
}
export const ENEMY_SEEDS: EnemySeed[] = [
  { kind: 'rocket', x: 15.55, y: 2.3, z: -61.3, yaw: -0.3 },
  { kind: 'gun', x: 9, y: 1.1, z: -114, yaw: 0 },
  { kind: 'rocket', x: -33, y: 2.3, z: -96, yaw: 0.6 },
  { kind: 'rocket', x: -15.05, y: 2.3, z: -200, yaw: 0.2 },
  { kind: 'gun', x: -47, y: 1.1, z: -228, yaw: 0 },
  { kind: 'tank', x: 8, y: 1.7, z: -257, yaw: Math.PI },
  { kind: 'demolition', x: 17, y: 1.4, z: -297, yaw: 0 },
  { kind: 'rocket', x: 13, y: 0.8, z: -349, yaw: 0, reserve: true },
  { kind: 'rocket', x: -16, y: 0.8, z: -345, yaw: 0, reserve: true },
  { kind: 'gun', x: 0, y: 1.1, z: -364, yaw: 0, reserve: true },
];
