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
  { x: 0, z: 9, w: 14, d: 14, h: 4.6 },
  { x: 0, z: -4, w: 4, d: 12, h: 3.4 },
  { x: 0, z: -17, w: 12, d: 14, h: 4 },
];
export const solids: Box[] = [
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
  { x: 0, y: 2, z: -24, w: 12.5, h: 4, d: 0.5 },
  { x: -4.7, y: 0.75, z: 8.5, w: 3.7, h: 1.5, d: 3, kind: 'gun' },
  { x: 4.9, y: 0.6, z: 6, w: 1.4, h: 1.2, d: 2, kind: 'crate' },
  { x: -3.8, y: 0.65, z: -15, w: 2.4, h: 1.3, d: 1.1, kind: 'crate' },
  { x: 4.4, y: 0.65, z: -19, w: 1.6, h: 1.3, d: 2, kind: 'crate' },
];
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
};
export type Effect = {
  kind: 'shot' | 'stone' | 'hit' | 'enemy' | 'hurt' | 'reload';
  x: number;
  y: number;
  z: number;
};
export type BunkerState = {
  status: 'ready' | 'playing' | 'paused' | 'won' | 'lost';
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
  guards: Guard[];
  effects: Effect[];
};
export type Input = {
  forward: number;
  strafe: number;
  turn: number;
  fire: boolean;
  reload: boolean;
};
export const emptyInput = (): Input => ({
  forward: 0,
  strafe: 0,
  turn: 0,
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
    reserve: 128,
    reload: 0,
    cooldown: 0,
    recoil: 0,
    time: 0,
    hurt: 0,
    steps: 0,
    medkit: true,
    effects: [],
    guards: [
      [2.7, 3.8],
      [0.7, -6.3],
      [-2.7, -17],
      [3.1, -21],
    ].map(([x, z], id) => ({
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
    })),
  };
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function look(b: BunkerState, dx: number, dy: number) {
  if (b.status !== 'playing') return;
  b.yaw -= dx * 0.0025;
  b.pitch = clamp(b.pitch - dy * 0.0025, -0.95, 0.95);
}
export function canStand(x: number, z: number, radius = 0.3) {
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
  return !solids.some(
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
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
  for (let i = 0; i < steps; i++) {
    if (canStand(body.x + dx / steps, body.z)) body.x += dx / steps;
    if (canStand(body.x, body.z + dz / steps)) body.z += dz / steps;
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
export function sightLine(ax: number, az: number, bx: number, bz: number) {
  const d = Math.hypot(bx - ax, bz - az);
  return solids.every(
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
      ...solids.map((s) => rayBox(origin, direction, s)),
    ),
    target: Guard | undefined;
  // Floor and ceiling also stop tracers and impacts.
  if (direction[1] < 0) distance = Math.min(distance, -1.65 / direction[1]);
  const room = rooms.find(
    (r) => Math.abs(b.x - r.x) < r.w / 2 && Math.abs(b.z - r.z) < r.d / 2,
  );
  if (direction[1] > 0)
    distance = Math.min(distance, ((room?.h ?? 4) - 1.65) / direction[1]);
  for (const guard of b.guards) {
    if (guard.health <= 0) continue;
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
    }
  }
  const [x, y, z] = origin.map((n, i) => n + direction[i] * distance);
  if (target) {
    target.health -= y > 1.45 ? 75 : 34;
    target.alert = true;
  }
  b.effects.push(
    { kind: 'shot', x, y, z },
    { kind: target ? 'hit' : 'stone', x, y, z },
  );
}
export function stepBunker(b: BunkerState, input: Input, delta: number) {
  if (b.status !== 'playing') return;
  const dt = clamp(delta, 0, 0.05);
  b.time += dt;
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
  const magnitude = Math.max(1, Math.hypot(input.forward, input.strafe)),
    forward = input.forward / magnitude,
    strafe = input.strafe / magnitude;
  const oldX = b.x,
    oldZ = b.z;
  moveBody(
    b,
    (-Math.sin(b.yaw) * forward + Math.cos(b.yaw) * strafe) * 3.1 * dt,
    (-Math.cos(b.yaw) * forward - Math.sin(b.yaw) * strafe) * 3.1 * dt,
  );
  b.steps += Math.hypot(b.x - oldX, b.z - oldZ);
  if (input.reload) reloadBunker(b);
  if (input.fire) shootBunker(b);
  for (const g of b.guards) {
    g.flash = Math.max(0, g.flash - dt);
    g.moving = false;
    if (g.health <= 0) {
      g.down = Math.min(1, g.down + dt * 1.8);
      continue;
    }
    const distance = Math.hypot(b.x - g.x, b.z - g.z),
      sees = distance < 19 && sightLine(g.x, g.z, b.x, b.z);
    if (!sees) {
      g.windup = 0;
      g.cooldown = Math.max(0.65, g.cooldown);
      continue;
    }
    g.alert = true;
    g.cooldown -= dt;
    if (distance > 6.5 && g.windup === 0) {
      const x = g.x,
        z = g.z;
      moveBody(
        g,
        ((b.x - g.x) / distance) * dt * 0.75,
        ((b.z - g.z) / distance) * dt * 0.75,
      );
      g.moving = Math.hypot(g.x - x, g.z - z) > 0.001;
    }
    if (g.windup > 0) {
      g.windup -= dt;
      if (g.windup <= 0) {
        g.windup = 0;
        g.cooldown = 1.7 + g.id * 0.17;
        g.flash = 0.14;
        b.effects.push({ kind: 'enemy', x: g.x, y: 1.35, z: g.z });
        if (
          Math.hypot(b.x - g.aimX, b.z - g.aimZ) < 1 &&
          sightLine(g.x, g.z, b.x, b.z)
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
    }
  }
  if (b.medkit && Math.hypot(b.x + 4.8, b.z + 12) < 1.2 && b.health < 100) {
    b.health = Math.min(100, b.health + 35);
    b.medkit = false;
  }
  if (b.health <= 0) b.status = 'lost';
  else if (
    b.guards.every((g) => g.health <= 0) &&
    Math.abs(b.x) < 1.5 &&
    b.z < -22.1
  )
    b.status = 'won';
}
