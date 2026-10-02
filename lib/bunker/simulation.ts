export type Box = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  kind?: 'wall' | 'crate' | 'gun';
};
export const rooms = [
  { name: 'Gun emplacement', x: 0, z: 9, w: 14, d: 14, h: 4.6 },
  { name: 'Service tunnel', x: 0, z: -4, w: 4, d: 12, h: 3.4 },
  { name: 'Munitions room', x: 0, z: -17, w: 12, d: 14, h: 4 },
  { name: 'Switchboard', x: 0, z: -28, w: 8, d: 8, h: 3.8 },
  { name: 'Generator room', x: 0, z: -37, w: 10, d: 10, h: 4 },
  { name: 'Cable tunnel', x: 0, z: -44, w: 4, d: 4, h: 3.4 },
  { name: 'Radio command room', x: 0, z: -51, w: 10, d: 10, h: 4 },
  { name: 'Quartermaster stores', x: 10, z: -17, w: 8, d: 10, h: 3.8 },
  { name: 'Barracks', x: 19, z: -17, w: 10, d: 10, h: 3.8 },
  { name: 'Infirmary', x: 19, z: -29, w: 10, d: 14, h: 3.8 },
  { name: 'Return passage', x: 9.5, z: -34, w: 9, d: 4, h: 3.4 },
  { name: 'Records vault', x: 19, z: -42, w: 10, d: 12, h: 3.8 },
];
const originalSolids: Box[] = [
  { x: 0, y: 2.3, z: 16, w: 14.5, h: 4.6, d: 0.5 },
  { x: 7, y: 2.3, z: 9, w: 0.5, h: 4.6, d: 14 },
  ...[3.5, 13.5].map((z) => ({ x: -7, y: 2.3, z, w: 0.5, h: 4.6, d: 5 })),
  { x: -7, y: 0.6, z: 8.5, w: 0.5, h: 1.2, d: 5 },
  { x: -7, y: 3.65, z: 8.5, w: 0.5, h: 1.9, d: 5 },
  ...[-4.5, 4.5].map((x) => ({ x, y: 2.3, z: 2, w: 5, h: 4.6, d: 0.5 })),
  { x: 0, y: 4, z: 2, w: 4, h: 1.2, d: 0.5 },
  { x: 0, y: 3.7, z: -10, w: 4, h: 0.6, d: 0.5 },
  ...[-2, 2].map((x) => ({ x, y: 1.7, z: -4, w: 0.5, h: 3.4, d: 12 })),
  ...[-4, 4].map((x) => ({ x, y: 2, z: -10, w: 4, h: 4, d: 0.5 })),
  ...[-6, 6].map((x) => ({ x, y: 2, z: -17, w: 0.5, h: 4, d: 14 })),
  ...[-3.7, 3.7].map((x) => ({ x, y: 2, z: -24, w: 4.6, h: 4, d: 0.5 })),
  ...[-2.7, 2.7].map((x) => ({ x, y: 2, z: -32, w: 2.6, h: 4, d: 0.5 })),
  ...[-24, -32].map((z) => ({ x: 0, y: 3.45, z, w: 2.8, h: 1.1, d: 0.5 })),
  ...[-4, 4].map((x) => ({ x, y: 1.9, z: -28, w: 0.5, h: 3.8, d: 8 })),
  ...[-5, 5].map((x) => ({ x, y: 2, z: -37, w: 0.5, h: 4, d: 10 })),
  ...[-4.5, 4.5].map((x) => ({ x, y: 2, z: -32, w: 1, h: 4, d: 0.5 })),
  { x: 0, y: 2, z: -42, w: 10.5, h: 4, d: 0.5 },
  { x: -2.8, y: 0.5, z: -28, w: 1.3, h: 1, d: 3, kind: 'crate' },
  { x: 3, y: 0.9, z: -37, w: 2.2, h: 1.8, d: 3.8, kind: 'gun' },
  { x: -4.7, y: 0.75, z: 8.5, w: 3.7, h: 1.5, d: 3, kind: 'gun' },
  { x: 4.9, y: 0.6, z: 6, w: 1.4, h: 1.2, d: 2, kind: 'crate' },
  { x: -3.8, y: 0.65, z: -15, w: 2.4, h: 1.3, d: 1.1, kind: 'crate' },
  { x: 4.4, y: 0.65, z: -19, w: 1.6, h: 1.3, d: 2, kind: 'crate' },
];

/** Doorways are shared by collision, wall detailing and the floor plan. */
export const passages = [
  { x: 6, z: -17, axis: 'x' },
  { x: 5, z: -34, axis: 'x' },
  { x: 0, z: -42, axis: 'z' },
] as const;
function cutPassage(wall: Box, x: number, z: number, axis: 'x' | 'z'): Box[] {
  const along = axis === 'x' ? 'z' : 'x',
    size = axis === 'x' ? 'd' : 'w';
  const center = along === 'x' ? x : z,
    low = wall[along] - wall[size] / 2,
    high = wall[along] + wall[size] / 2;
  return [
    { ...wall, [along]: (low + center - 1.4) / 2, [size]: center - 1.4 - low },
    {
      ...wall,
      [along]: (center + 1.4 + high) / 2,
      [size]: high - center - 1.4,
    },
    {
      ...wall,
      [along]: center,
      [size]: 2.8,
      y: (wall.h + 2.9) / 2,
      h: wall.h - 2.9,
    },
  ].filter((w) => w.w > 0.01 && w.d > 0.01 && w.h > 0.01);
}
const extendedWalls: Box[] = [];
for (const r of rooms.slice(5)) {
  for (const axis of ['x', 'z'] as const)
    for (const side of [-1, 1]) {
      const size = axis === 'x' ? 'w' : 'd',
        along = axis === 'x' ? 'z' : 'x',
        extent = axis === 'x' ? 'd' : 'w',
        boundary = r[axis] + (side * r[size]) / 2;
      const wall: Box = { x: r.x, z: r.z, y: r.h / 2, w: r.w, d: r.d, h: r.h };
      wall[axis] = boundary;
      wall[size] = 0.5;
      const neighbor = rooms.find(
        (n) =>
          n !== r &&
          Math.abs(n[axis] - (side * n[size]) / 2 - boundary) < 0.01 &&
          Math.min(r[along] + r[extent] / 2, n[along] + n[extent] / 2) -
            Math.max(r[along] - r[extent] / 2, n[along] - n[extent] / 2) >=
            2.8,
      );
      if (neighbor) {
        const c =
          (Math.min(
            r[along] + r[extent] / 2,
            neighbor[along] + neighbor[extent] / 2,
          ) +
            Math.max(
              r[along] - r[extent] / 2,
              neighbor[along] - neighbor[extent] / 2,
            )) /
          2;
        extendedWalls.push(
          ...cutPassage(
            wall,
            axis === 'x' ? boundary : c,
            axis === 'z' ? boundary : c,
            axis,
          ),
        );
      } else extendedWalls.push(wall);
    }
}
export const solids: Box[] = [
  ...originalSolids.flatMap((w) => {
    const opening = passages.find(
      (p) =>
        Math.abs(w[p.axis] - p[p.axis]) < 0.01 &&
        (p.axis === 'x' ? w.d > 8 && w.w < 1 : w.w > 8 && w.d < 1),
    );
    return opening ? cutPassage(w, opening.x, opening.z, opening.axis) : [w];
  }),
  ...extendedWalls,
  ...[-2, 2].map((x) => ({
    x,
    y: 1.05,
    z: -54.8,
    w: 2.2,
    h: 2.1,
    d: 1.2,
    kind: 'gun' as const,
  })),
  ...[16, 22].flatMap((x) =>
    [-14, -19.5].map((z) => ({
      x,
      y: 0.8,
      z,
      w: 1.4,
      h: 1.6,
      d: 2.2,
      kind: 'gun' as const,
    })),
  ),
  ...[16, 22].map((x) => ({
    x,
    y: 0.4,
    z: -28,
    w: 1.4,
    h: 0.8,
    d: 2.4,
    kind: 'gun' as const,
  })),
  { x: 11.5, y: 0.7, z: -14, w: 2, h: 1.4, d: 1.8, kind: 'crate' },
  { x: 8.3, y: 0.6, z: -20, w: 2, h: 1.2, d: 1.5, kind: 'crate' },
  { x: 22.6, y: 1, z: -42, w: 1.2, h: 2, d: 7, kind: 'crate' },
];
export const chargeSites = [
  { x: -2, y: 1.15, z: -54.12, name: 'Transmitter' },
  { x: 2, y: 1.15, z: -54.12, name: 'Radio control rack' },
];
export const roomAt = (x: number, z: number) =>
  rooms.find(
    (r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2,
  );
export type GuardMode = 'idle' | 'notice' | 'engage' | 'search';
export type DeathAction = 'reel' | 'spin' | 'sprawl' | 'fold' | 'kneel';
export type HitRegion = 'head' | 'torso' | 'leg';
export type Guard = {
  id: number;
  x: number;
  z: number;
  health: number;
  cooldown: number;
  windup: number;
  aimX: number;
  aimZ: number;
  flash: number;
  down: number;
  moving: boolean;
  alert: boolean;
  mode: GuardMode;
  yaw: number;
  headYaw: number;
  homeYaw: number;
  awareness: number;
  readiness: number;
  startle: number;
  memory: number;
  lastX: number;
  lastZ: number;
  deathAction: DeathAction;
  hitSide: number;
  hitPower: number;
  hitLift: number;
  hitPoint: { x: number; y: number; z: number };
  bodyTargets?: {
    x: number;
    y: number;
    z: number;
    r: number;
    region: HitRegion;
  }[];
  hits: number;
  hitTime: number;
  hitRegion: HitRegion;
  hitDirection: { x: number; z: number };
};
export type Effect = {
  kind:
    | 'shot'
    | 'stone'
    | 'hit'
    | 'enemy'
    | 'hurt'
    | 'reload'
    | 'blast'
    | 'bounce'
    | 'door'
    | 'charge';
  direction?: number[];
  guardId?: number;
  fatal?: boolean;
  x: number;
  y: number;
  z: number;
};
export const guardSpawns = [
  [2.7, 3.8],
  [0.7, -6.3],
  [-2.7, -17],
  [3.1, -21],
  [2.3, -29],
  [-2.5, -38],
  [9, -18],
  [19.5, -15.5],
  [20, -32],
  [18, -42],
  [-2.7, -49],
  [2.8, -52],
];
export const doorLayouts = [
  { x: 0, z: -24, label: 'Switchboard' },
  { x: 0, z: -32, label: 'Generator room' },
  { x: 0, z: -46, label: 'Radio command' },
  { x: 19, z: -22, label: 'Infirmary' },
  { x: 19, z: -36, label: 'Records vault' },
];
export type Door = { x: number; z: number; progress: number; opening: boolean };
export type Grenade = {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
};
export const doorBox = (door: Door): Box => ({
  x: door.x + door.progress * 3,
  y: 1.45,
  z: door.z,
  w: 2.8,
  h: 2.9,
  d: 0.18,
});
export const worldSolids = (b: BunkerState): Box[] => [
  ...solids,
  ...b.doors.map(doorBox),
];
export const nearbyDoor = (b: BunkerState) =>
  b.doors.find((d) => !d.opening && Math.hypot(b.x - d.x, b.z - d.z) < 2.5);
export function openDoor(b: BunkerState) {
  if (b.status !== 'playing') return;
  const door = nearbyDoor(b);
  if (door) {
    door.opening = true;
    b.effects.push({ kind: 'door', x: door.x, y: 1.4, z: door.z });
  }
}
export type BunkerState = {
  status: 'ready' | 'playing' | 'paused' | 'cinematic' | 'won' | 'lost';
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  ammo: number;
  reserve: number;
  reload: number;
  cooldown: number;
  recoil: number;
  time: number;
  hurt: number;
  steps: number;
  medkit: boolean;
  supplies: boolean[];
  mission: 'search' | 'plant' | 'escape';
  weapon: 'mp40' | 'charge';
  charges: boolean[];
  planting: number | null;
  plantTime: number;
  plantX: number;
  plantZ: number;
  doors: Door[];
  grenades: number;
  activeGrenades: Grenade[];
  nextGrenadeId: number;
  grenadeCooldown: number;
  blastShake: number;
  guards: Guard[];
  effects: Effect[];
};
export type Input = {
  forward: number;
  strafe: number;
  turn: number;
  aimPitch: number;
  fire: boolean;
  reload: boolean;
};
export const emptyInput = (): Input => ({
  forward: 0,
  strafe: 0,
  turn: 0,
  aimPitch: 0,
  fire: false,
  reload: false,
});
export function createBunker(): BunkerState {
  return {
    status: 'ready',
    x: 0,
    z: 12,
    yaw: 0,
    pitch: 0,
    health: 100,
    ammo: 32,
    reserve: 192,
    reload: 0,
    cooldown: 0,
    recoil: 0,
    time: 0,
    hurt: 0,
    steps: 0,
    medkit: true,
    supplies: [true, true],
    mission: 'search',
    weapon: 'mp40',
    charges: [false, false],
    planting: null,
    plantTime: 0,
    plantX: 0,
    plantZ: 0,
    doors: doorLayouts.map((d) => ({
      x: d.x,
      z: d.z,
      progress: 0,
      opening: false,
    })),
    grenades: 3,
    activeGrenades: [],
    nextGrenadeId: 0,
    grenadeCooldown: 0,
    blastShake: 0,
    effects: [],
    guards: guardSpawns.map(([x, z], id) => ({
      id,
      x,
      z,
      health: 100,
      cooldown: 1.4 + id * 0.3,
      windup: 0,
      aimX: 0,
      aimZ: 0,
      flash: 0,
      down: 0,
      moving: false,
      alert: false,
      mode: 'idle',
      yaw: [2.3, Math.PI, 2.7, 2.4, 0.4, -0.3, 1.6, 2.2, 0.3, 0.2, 0.4, -0.7][
        id
      ],
      homeYaw: [
        2.3,
        Math.PI,
        2.7,
        2.4,
        0.4,
        -0.3,
        1.6,
        2.2,
        0.3,
        0.2,
        0.4,
        -0.7,
      ][id],
      headYaw: 0,
      awareness: 0,
      readiness: 0,
      startle: 0,
      memory: 0,
      lastX: x,
      lastZ: z,
      deathAction: 'reel',
      hitSide: 0,
      hitPower: 1,
      hitLift: 0,
      hitPoint: { x, y: 1.3, z },
      hits: 0,
      hitTime: 0,
      hitRegion: 'torso',
      hitDirection: { x: 0, z: -1 },
    })),
  };
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function look(b: BunkerState, dx: number, dy: number) {
  if (b.status !== 'playing') return;
  b.yaw -= dx * 0.0025;
  b.pitch = clamp(b.pitch - dy * 0.0025, -0.95, 0.95);
}
export function canStand(
  x: number,
  z: number,
  radius = 0.3,
  obstacles: Box[] = solids,
) {
  if (
    !rooms.some(
      (r) =>
        x >= r.x - r.w / 2 &&
        x <= r.x + r.w / 2 &&
        z >= r.z - r.d / 2 &&
        z <= r.z + r.d / 2,
    )
  )
    return false;
  return !obstacles.some(
    (s) =>
      s.y - s.h / 2 < 1.8 &&
      Math.abs(x - s.x) < s.w / 2 + radius &&
      Math.abs(z - s.z) < s.d / 2 + radius,
  );
}
export function moveBody(
  body: { x: number; z: number },
  dx: number,
  dz: number,
  obstacles: Box[] = solids,
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  for (let i = 0; i < steps; i++) {
    if (canStand(body.x + dx / steps, body.z, 0.3, obstacles))
      body.x += dx / steps;
    if (canStand(body.x, body.z + dz / steps, 0.3, obstacles))
      body.z += dz / steps;
  }
}
/** Slab intersection shared by walls, cover, and guard hit volumes. */
export function rayBox(
  origin: number[],
  direction: number[],
  box: Box,
): number {
  let near = 0,
    far = Infinity;
  const centers = [box.x, box.y, box.z],
    sizes = [box.w, box.h, box.d];
  for (let i = 0; i < 3; i++) {
    const low = centers[i] - sizes[i] / 2,
      high = centers[i] + sizes[i] / 2;
    if (Math.abs(direction[i]) < 1e-8) {
      if (origin[i] < low || origin[i] > high) return Infinity;
    } else {
      const a = (low - origin[i]) / direction[i],
        c = (high - origin[i]) / direction[i];
      near = Math.max(near, Math.min(a, c));
      far = Math.min(far, Math.max(a, c));
      if (near > far) return Infinity;
    }
  }
  return far < 0 ? Infinity : near;
}
export function sightLine(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  obstacles: Box[] = solids,
) {
  const d = Math.hypot(bx - ax, bz - az);
  if (d < 1e-6) return true;
  return obstacles.every(
    (s) => rayBox([ax, 1.45, az], [(bx - ax) / d, 0, (bz - az) / d], s) > d,
  );
}
export function reloadBunker(b: BunkerState) {
  if (b.status !== 'playing' || b.reload > 0 || b.ammo === 32 || b.reserve <= 0)
    return;
  b.reload = 1.65;
  b.effects.push({ kind: 'reload', x: b.x, y: 1, z: b.z });
}
export function shootBunker(b: BunkerState) {
  if (b.weapon === 'charge') {
    plantCharge(b);
    return;
  }
  if (b.status !== 'playing' || b.cooldown > 0 || b.reload > 0) return;
  if (b.ammo <= 0) {
    reloadBunker(b);
    return;
  }
  b.ammo--;
  b.cooldown = 0.13;
  b.recoil = 1;
  const origin = [b.x, 1.65, b.z],
    direction = [
      -Math.sin(b.yaw) * Math.cos(b.pitch),
      Math.sin(b.pitch),
      -Math.cos(b.yaw) * Math.cos(b.pitch),
    ];
  let distance = Math.min(
      45,
      ...worldSolids(b).map((s) => rayBox(origin, direction, s)),
    ),
    target: Guard | undefined,
    region: HitRegion | undefined;
  // Floor and ceiling also stop tracers and impacts.
  if (direction[1] < 0) distance = Math.min(distance, -1.65 / direction[1]);
  const room = rooms.find(
    (r) => Math.abs(b.x - r.x) < r.w / 2 && Math.abs(b.z - r.z) < r.d / 2,
  );
  if (direction[1] > 0)
    distance = Math.min(distance, ((room?.h ?? 4) - 1.65) / direction[1]);
  for (const guard of b.guards) {
    if (guard.health <= 0) {
      for (const body of guard.bodyTargets ?? []) {
        const ox = origin[0] - body.x,
          oy = origin[1] - body.y,
          oz = origin[2] - body.z;
        const along = ox * direction[0] + oy * direction[1] + oz * direction[2];
        const discriminant =
          along * along - (ox * ox + oy * oy + oz * oz - body.r * body.r);
        if (discriminant < 0) continue;
        const hit = -along - Math.sqrt(discriminant);
        if (hit >= 0 && hit < distance) {
          distance = hit;
          target = guard;
          region = body.region;
        }
      }
      continue;
    }
    const hit = rayBox(origin, direction, {
      x: guard.x,
      y: 0.9,
      z: guard.z,
      w: 0.65,
      h: 1.8,
      d: 0.55,
    });
    if (hit < distance) {
      distance = hit;
      target = guard;
      region = undefined;
    }
  }
  const [x, y, z] = origin.map((n, i) => n + direction[i] * distance);
  if (target) {
    const wasAlive = target.health > 0;
    target.hitPoint = { x, y, z };
    target.hitPower = 1;
    target.hitLift = 0;
    target.hits++;
    target.hitSide = clamp(
      ((x - target.x) * Math.cos(target.yaw) -
        (z - target.z) * Math.sin(target.yaw)) /
        0.32,
      -1,
      1,
    );
    target.health -= y > 1.45 ? 75 : 34;
    target.alert = true;
    target.hitTime = 0.42;
    target.hitRegion =
      region ?? (y > 1.45 ? 'head' : y < 0.75 ? 'leg' : 'torso');
    const horizontal = Math.hypot(direction[0], direction[2]) || 1;
    target.hitDirection = {
      x: direction[0] / horizontal,
      z: direction[2] / horizontal,
    };
    target.windup = 0;
    target.flash = 0;
    target.cooldown = Math.max(target.cooldown, 0.65);
    target.lastX = b.x;
    target.lastZ = b.z;
    target.memory = 4.5;
    target.awareness = 1;
    target.mode = 'engage';
    if (wasAlive && target.health <= 0) {
      prepareDeath(target, b.time);
      if (target.deathAction === 'reel') {
        target.hitPower = 1.25;
        target.hitLift = 0;
      }
    }
  }
  // A nearby shot attracts attention to its origin, even before visual recognition.
  for (const g of b.guards) {
    if (g.health <= 0 || g === target || g.mode === 'engage') continue;
    const distance = Math.hypot(g.x - b.x, g.z - b.z);
    if (distance < (sightLine(g.x, g.z, b.x, b.z, worldSolids(b)) ? 14 : 7)) {
      g.mode = 'search';
      g.lastX = b.x;
      g.lastZ = b.z;
      g.memory = 4;
      g.awareness = Math.max(g.awareness, 0.45);
      g.startle = 0.35;
    }
  }
  b.effects.push(
    { kind: 'shot', x, y, z },
    {
      kind: target ? 'hit' : 'stone',
      x,
      y,
      z,
      direction,
      guardId: target?.id,
      fatal: target ? target.health <= 0 : false,
    },
  );
}
export const nearbyChargeSite = (b: BunkerState) =>
  chargeSites.findIndex(
    (site, i) =>
      !b.charges[i] &&
      Math.hypot(b.x - site.x, b.z - site.z) < 2.1 &&
      sightLine(b.x, b.z, site.x, site.z, worldSolids(b)),
  );
export function equipCharges(b: BunkerState) {
  if (b.status !== 'playing') return;
  b.weapon = b.weapon === 'charge' ? 'mp40' : 'charge';
  b.planting = null;
  b.plantTime = 0;
}
export function plantCharge(b: BunkerState) {
  if (b.status !== 'playing' || b.planting !== null) return;
  const site = nearbyChargeSite(b);
  if (site < 0) return;
  b.weapon = 'charge';
  b.planting = site;
  b.plantTime = 0;
  b.plantX = b.x;
  b.plantZ = b.z;
}
export function finishBunker(b: BunkerState) {
  if (b.status === 'cinematic') b.status = 'won';
}
export function stepBunker(b: BunkerState, input: Input, delta: number) {
  if (b.status !== 'playing') return;
  const dt = clamp(delta, 0, 0.05);
  b.time += dt;
  for (const d of b.doors)
    if (d.opening) d.progress = Math.min(1, d.progress + dt * 0.85);
  b.grenadeCooldown = Math.max(0, b.grenadeCooldown - dt);
  b.blastShake = Math.max(0, b.blastShake - dt * 1.7);
  stepGrenades(b, dt);
  b.cooldown = Math.max(0, b.cooldown - dt);
  b.recoil = Math.max(0, b.recoil - dt * 8);
  b.hurt = Math.max(0, b.hurt - dt);
  if (b.reload > 0) {
    b.reload = Math.max(0, b.reload - dt);
    if (b.reload === 0) {
      const count = Math.min(32 - b.ammo, b.reserve);
      b.ammo += count;
      b.reserve -= count;
    }
  }
  b.yaw -= clamp(input.turn, -1, 1) * 1.6 * dt;
  b.pitch = clamp(
    b.pitch + clamp(input.aimPitch, -1, 1) * 1.2 * dt,
    -0.95,
    0.95,
  );
  const magnitude = Math.max(1, Math.hypot(input.forward, input.strafe)),
    forward = input.forward / magnitude,
    strafe = input.strafe / magnitude;
  const oldX = b.x,
    oldZ = b.z;
  moveBody(
    b,
    (-Math.sin(b.yaw) * forward + Math.cos(b.yaw) * strafe) * 3.1 * dt,
    (-Math.cos(b.yaw) * forward - Math.sin(b.yaw) * strafe) * 3.1 * dt,
    worldSolids(b),
  );
  b.steps += Math.hypot(b.x - oldX, b.z - oldZ);
  if (input.reload) reloadBunker(b);
  if (input.fire) shootBunker(b);
  for (const g of b.guards) {
    g.flash = Math.max(0, g.flash - dt);
    g.hitTime = Math.max(0, g.hitTime - dt);
    g.moving = false;
    if (g.health <= 0) {
      g.down = Math.min(
        1,
        g.down +
          dt /
            { reel: 1.55, spin: 1.65, sprawl: 1.2, fold: 1.45, kneel: 1.85 }[
              g.deathAction
            ],
      );
      continue;
    }
    updateGuard(g, b, dt);
  }
  if (b.medkit && Math.hypot(b.x + 4.8, b.z + 12) < 1.2 && b.health < 100) {
    b.health = Math.min(100, b.health + 35);
    b.medkit = false;
  }
  if (b.mission === 'search' && roomAt(b.x, b.z)?.name === 'Radio command room')
    b.mission = 'plant';
  if (b.planting !== null) {
    if (
      Math.hypot(b.x - b.plantX, b.z - b.plantZ) > 0.35 ||
      b.weapon !== 'charge'
    ) {
      b.planting = null;
      b.plantTime = 0;
    } else {
      b.plantTime += dt;
      if (b.plantTime >= 1.8) {
        b.charges[b.planting] = true;
        b.effects.push({ kind: 'charge', ...chargeSites[b.planting] });
        b.planting = null;
        b.plantTime = 0;
        if (b.charges.every(Boolean)) {
          b.mission = 'escape';
          b.weapon = 'mp40';
        }
      }
    }
  }
  for (const [i, x, z] of [
    [0, 19, -33.5],
    [1, 17, -44.5],
  ]) {
    if (b.supplies[i] && Math.hypot(b.x - x, b.z - z) < 1.2) {
      b.supplies[i] = false;
      b.health = Math.min(100, b.health + 45);
      b.reserve += 64;
    }
  }
  if (b.health <= 0) b.status = 'lost';
  else if (
    b.mission === 'escape' &&
    b.charges.every(Boolean) &&
    Math.abs(b.x) < 1.35 &&
    b.z > 14.2
  )
    b.status = 'cinematic';
}

export const angleDifference = (target: number, current: number) =>
  Math.atan2(Math.sin(target - current), Math.cos(target - current));
const turnToward = (
  current: number,
  target: number,
  rate: number,
  dt: number,
) => current + clamp(angleDifference(target, current), -rate * dt, rate * dt);
/** Choose only the initial reflex; physics determines the actual fall and landing. */
export function prepareDeath(g: Guard, time: number) {
  const actions: DeathAction[] = ['reel', 'spin', 'sprawl', 'fold'];
  g.deathAction =
    g.hitRegion === 'leg'
      ? 'kneel'
      : actions[(g.id + g.hits + Math.floor(time * 3)) % actions.length];
}
function updateGuard(g: Guard, b: BunkerState, dt: number) {
  g.startle = Math.max(0, g.startle - dt);
  const distance = Math.hypot(b.x - g.x, b.z - g.z);
  const bearing = Math.atan2(g.x - b.x, g.z - b.z);
  const visible =
    distance < 19 && sightLine(g.x, g.z, b.x, b.z, worldSolids(b));
  const inView =
    Math.abs(angleDifference(bearing, g.yaw + g.headYaw)) <
    (distance < 4 ? 1.5 : 1.15);
  const sees = visible && inView;
  if (sees) {
    g.lastX = b.x;
    g.lastZ = b.z;
    g.memory = 4.5;
    const previous = g.awareness;
    g.awareness = Math.min(1, g.awareness + dt / (0.38 + g.id * 0.055));
    if (previous < 1 && g.awareness >= 1) {
      g.startle = 0.48;
      g.alert = true;
      g.cooldown = Math.max(0.3, g.cooldown);
    }
    g.mode = g.awareness >= 1 ? 'engage' : 'notice';
  } else {
    g.windup = 0;
    g.memory = Math.max(0, g.memory - dt);
    g.mode = g.memory > 0 ? 'search' : 'idle';
    g.awareness = Math.max(g.alert ? 0.25 : 0, g.awareness - dt * 0.25);
  }
  const tracking = g.mode !== 'idle';
  const target = tracking
    ? Math.atan2(g.x - g.lastX, g.z - g.lastZ)
    : g.homeYaw;
  // The head finds a threat first; shoulders and weapon follow at a bounded speed.
  const headTarget = tracking
    ? clamp(angleDifference(target, g.yaw), -0.55, 0.55)
    : Math.sin(b.time * 0.75 + g.id) * 0.23;
  g.headYaw = turnToward(g.headYaw, headTarget, 3.5, dt);
  if (g.hitTime <= 0)
    g.yaw = turnToward(g.yaw, target, g.mode === 'notice' ? 1.3 : 2.1, dt);
  const desiredReady =
    g.mode === 'engage'
      ? 1
      : g.mode === 'notice'
        ? 0.4
        : g.mode === 'search'
          ? 0.65
          : g.alert
            ? 0.25
            : 0;
  g.readiness += clamp(desiredReady - g.readiness, -dt * 1.8, dt * 2.2);
  if (g.hitTime > 0) return;
  g.cooldown = Math.max(0, g.cooldown - dt);
  const aligned = Math.abs(angleDifference(target, g.yaw)) < 0.22;
  if (
    g.mode !== 'engage' ||
    !sees ||
    !aligned ||
    g.readiness < 0.9 ||
    g.startle > 0.15
  ) {
    g.windup = 0;
    if (
      tracking &&
      g.mode !== 'notice' &&
      Math.abs(angleDifference(target, g.yaw)) < 0.65
    ) {
      const gap = Math.hypot(g.lastX - g.x, g.lastZ - g.z);
      if (gap > (g.mode === 'search' ? 1 : 6.5)) {
        const x = g.x,
          z = g.z,
          speed = g.mode === 'search' ? 0.48 : 0.7;
        moveBody(
          g,
          ((g.lastX - g.x) / gap) * dt * speed,
          ((g.lastZ - g.z) / gap) * dt * speed,
          worldSolids(b),
        );
        g.moving = Math.hypot(g.x - x, g.z - z) > 0.001;
      }
    }
    return;
  }
  if (g.windup > 0) {
    g.windup = Math.max(0, g.windup - dt);
    if (g.windup === 0) {
      g.cooldown = 1.7 + g.id * 0.17;
      g.flash = 0.14;
      b.effects.push({ kind: 'enemy', x: g.x, y: 1.35, z: g.z });
      if (
        Math.hypot(b.x - g.aimX, b.z - g.aimZ) < 1 &&
        sightLine(g.x, g.z, b.x, b.z, worldSolids(b))
      ) {
        b.health = Math.max(0, b.health - 8);
        b.hurt = 0.4;
        b.effects.push({ kind: 'hurt', x: b.x, y: 1, z: b.z });
      }
    }
  } else if (g.cooldown <= 0) {
    g.windup = 0.65;
    g.aimX = b.x;
    g.aimZ = b.z;
  } else if (distance > 6.5) {
    const x = g.x,
      z = g.z;
    moveBody(
      g,
      ((b.x - g.x) / distance) * dt * 0.7,
      ((b.z - g.z) / distance) * dt * 0.7,
      worldSolids(b),
    );
    g.moving = Math.hypot(g.x - x, g.z - z) > 0.001;
  }
}

/** One press releases one grenade; all motion and fuse time belong to the simulation. */
export function throwGrenade(b: BunkerState) {
  if (b.status !== 'playing' || b.grenades <= 0 || b.grenadeCooldown > 0)
    return;
  b.planting = null;
  b.plantTime = 0;
  b.grenades--;
  b.grenadeCooldown = 0.8;
  b.activeGrenades.push({
    id: b.nextGrenadeId++,
    x: b.x,
    y: 1.45,
    z: b.z,
    vx: -Math.sin(b.yaw) * Math.cos(b.pitch) * 8,
    vy: 3.5 + Math.sin(b.pitch) * 7,
    vz: -Math.cos(b.yaw) * Math.cos(b.pitch) * 8,
    fuse: 2.3,
  });
}
export function explodeGrenade(
  b: BunkerState,
  p: Pick<Grenade, 'x' | 'y' | 'z'>,
) {
  const obstacles = worldSolids(b);
  const exposure = (x: number, y: number, z: number) => {
    const dx = x - p.x,
      dy = y - p.y,
      dz = z - p.z,
      distance = Math.hypot(dx, dy, dz);
    if (distance >= 5.5) return 0;
    const direction = [dx, dy, dz].map((n) => n / (distance || 1));
    if (obstacles.some((s) => rayBox([p.x, p.y, p.z], direction, s) < distance))
      return 0;
    return 1 - distance / 5.5;
  };
  b.effects.push({ kind: 'blast', ...p });
  for (const g of b.guards) {
    const point =
      g.health > 0
        ? { x: g.x, y: 1.05, z: g.z }
        : (g.bodyTargets?.find((t) => t.region === 'torso') ?? {
            x: g.x,
            y: 0.25,
            z: g.z,
          });
    const strength = exposure(point.x, point.y, point.z);
    if (!strength) continue;
    const alive = g.health > 0,
      length = Math.hypot(point.x - p.x, point.z - p.z) || 1;
    g.health -= Math.round(strength * 180);
    g.hitPoint = point;
    g.hitRegion = 'torso';
    g.hits++;
    g.hitTime = 0.6;
    g.hitDirection = {
      x: (point.x - p.x) / length,
      z: (point.z - p.z) / length,
    };
    g.hitPower = 2 + strength * 4;
    g.hitLift = 0.8 + strength * 2;
    g.windup = 0;
    g.cooldown = Math.max(g.cooldown, 1);
    g.alert = true;
    g.lastX = b.x;
    g.lastZ = b.z;
    g.memory = 5;
    g.mode = 'search';
    if (alive && g.health <= 0) {
      prepareDeath(g, b.time);
      g.deathAction = 'sprawl';
    }
    b.effects.push({
      kind: 'hit',
      ...point,
      guardId: g.id,
      fatal: g.health <= 0,
      direction: [g.hitDirection.x, 0.4, g.hitDirection.z],
    });
  }
  const damage = Math.round(exposure(b.x, 1, b.z) * 125);
  if (damage) {
    b.health = Math.max(0, b.health - damage);
    b.hurt = 0.7;
  }
  b.blastShake = Math.max(
    b.blastShake,
    Math.max(0, 1 - Math.hypot(b.x - p.x, b.z - p.z) / 16),
  );
}
function stepGrenades(b: BunkerState, dt: number) {
  const obstacles = worldSolids(b),
    steps = Math.max(1, Math.ceil(dt / 0.008)),
    h = dt / steps,
    radius = 0.085;
  for (let i = b.activeGrenades.length - 1; i >= 0; i--) {
    const p = b.activeGrenades[i];
    for (let k = 0; k < steps; k++) {
      p.vy -= 9.81 * h;
      for (const [axis, velocity] of [
        ['x', 'vx'],
        ['y', 'vy'],
        ['z', 'vz'],
      ] as const) {
        const old = p[axis];
        p[axis] += p[velocity] * h;
        if (
          obstacles.some(
            (s) =>
              Math.abs(p.x - s.x) < s.w / 2 + radius &&
              Math.abs(p.y - s.y) < s.h / 2 + radius &&
              Math.abs(p.z - s.z) < s.d / 2 + radius,
          )
        ) {
          p[axis] = old;
          p[velocity] *= -0.42;
          if (Math.abs(p[velocity]) > 0.8)
            b.effects.push({ kind: 'bounce', x: p.x, y: p.y, z: p.z });
        }
      }
      const room = rooms.find(
        (r) => Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.z - r.z) <= r.d / 2,
      );
      if (p.y < radius) {
        p.y = radius;
        if (p.vy < -1)
          b.effects.push({ kind: 'bounce', x: p.x, y: p.y, z: p.z });
        p.vy = Math.abs(p.vy) * 0.32;
        p.vx *= 0.83;
        p.vz *= 0.83;
      } else if (room && p.y > room.h - radius) {
        p.y = room.h - radius;
        p.vy = -Math.abs(p.vy) * 0.4;
      }
    }
    p.fuse -= dt;
    if (p.fuse <= 0) {
      explodeGrenade(b, p);
      b.activeGrenades.splice(i, 1);
    }
  }
}
