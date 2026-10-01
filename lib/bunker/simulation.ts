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
export type GuardMode = 'idle' | 'notice' | 'engage' | 'search';
export type FallStyle = 'front' | 'back' | 'left' | 'right' | 'kneel';
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
  fallStyle: FallStyle;
  deathAction: DeathAction;
  deathTurn: number;
  deathTravel: number;
  hitSide: number;
  hits: number;
  hitTime: number;
  hitRegion: HitRegion;
  hitDirection: { x: number; z: number };
};
export type Effect = {
  kind: 'shot' | 'stone' | 'hit' | 'enemy' | 'hurt' | 'reload';
  direction?: number[];
  guardId?: number;
  fatal?: boolean;
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
      mode: 'idle',
      yaw: [2.3, Math.PI, 2.7, 2.4][id],
      homeYaw: [2.3, Math.PI, 2.7, 2.4][id],
      headYaw: 0,
      awareness: 0,
      readiness: 0,
      startle: 0,
      memory: 0,
      lastX: x,
      lastZ: z,
      fallStyle: 'back',
      deathAction: 'reel',
      deathTurn: 0,
      deathTravel: 0,
      hitSide: 0,
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
  if (d < 1e-6) return true;
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
    target.hitRegion = y > 1.45 ? 'head' : y < 0.75 ? 'leg' : 'torso';
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
    if (target.health <= 0) prepareDeath(target, b.time);
  }
  // A nearby shot attracts attention to its origin, even before visual recognition.
  for (const g of b.guards) {
    if (g.health <= 0 || g === target || g.mode === 'engage') continue;
    const distance = Math.hypot(g.x - b.x, g.z - b.z);
    if (distance < (sightLine(g.x, g.z, b.x, b.z) ? 14 : 7)) {
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
  if (b.health <= 0) b.status = 'lost';
  else if (
    b.guards.every((g) => g.health <= 0) &&
    Math.abs(b.x) < 1.5 &&
    b.z < -22.1
  )
    b.status = 'won';
}

export const angleDifference = (target: number, current: number) =>
  Math.atan2(Math.sin(target - current), Math.cos(target - current));
const turnToward = (
  current: number,
  target: number,
  rate: number,
  dt: number,
) => current + clamp(angleDifference(target, current), -rate * dt, rate * dt);
export function fallVector(g: Pick<Guard, 'yaw' | 'fallStyle'>) {
  const side = g.fallStyle === 'left' ? -1 : g.fallStyle === 'right' ? 1 : 0;
  const front = g.fallStyle === 'back' ? -1 : 1;
  return side
    ? { x: Math.cos(g.yaw) * side, z: -Math.sin(g.yaw) * side }
    : { x: -Math.sin(g.yaw) * front, z: -Math.cos(g.yaw) * front };
}
export function chooseFall(g: Guard): FallStyle {
  const localX =
    Math.cos(g.yaw) * g.hitDirection.x - Math.sin(g.yaw) * g.hitDirection.z;
  const localZ =
    Math.sin(g.yaw) * g.hitDirection.x + Math.cos(g.yaw) * g.hitDirection.z;
  const preferred: FallStyle =
    g.hitRegion === 'leg'
      ? 'kneel'
      : Math.abs(localX) > 0.6
        ? localX > 0
          ? 'right'
          : 'left'
        : localZ > 0
          ? 'back'
          : 'front';
  for (const style of [
    preferred,
    localX > 0 ? 'right' : 'left',
    localX > 0 ? 'left' : 'right',
    'front',
    'back',
  ] as FallStyle[]) {
    const v = fallVector({ ...g, fallStyle: style });
    if (
      [0.35, 0.7, 0.95, -0.55].every((d) =>
        canStand(g.x + v.x * d, g.z + v.z * d, 0.22),
      )
    )
      return style;
  }
  return 'kneel';
}
/** Choose choreography once at impact. Sweep its displacement and final body footprint
 * so expressive motion cannot carry a corpse through the room's solid walls. */
export function prepareDeath(g: Guard, time: number) {
  const actions: DeathAction[] = ['reel', 'spin', 'sprawl', 'fold'];
  g.deathAction =
    g.hitRegion === 'leg'
      ? 'kneel'
      : actions[(g.id + g.hits + Math.floor(time * 3)) % actions.length];
  g.fallStyle = chooseFall(g);
  if (g.fallStyle === 'kneel') g.deathAction = 'kneel';
  const sign =
    Math.abs(g.hitSide) > 0.15 ? Math.sign(g.hitSide) : g.id % 2 ? -1 : 1;
  const requestedTurn =
    g.deathAction === 'spin'
      ? sign * 1.35
      : g.deathAction === 'fold'
        ? sign * 0.32
        : sign * 0.12;
  const travel =
    g.deathAction === 'reel'
      ? 0.72
      : g.deathAction === 'spin'
        ? 0.42
        : g.deathAction === 'sprawl'
          ? 0.5
          : 0.18;
  const direction = fallVector(g);
  g.deathTurn = 0;
  g.deathTravel = 0;
  for (const scale of [1, 0.65, 0.3, 0]) {
    const fits = [0.25, 0.5, 0.75, 1].every((t) => {
      const yaw = g.yaw + requestedTurn * scale * t;
      const v = fallVector({ yaw, fallStyle: g.fallStyle });
      const x = g.x + direction.x * travel * scale * t;
      const z = g.z + direction.z * travel * scale * t;
      return [-0.65, 0, 0.5, 0.95].every((d) =>
        canStand(x + v.x * d, z + v.z * d, 0.36),
      );
    });
    if (fits) {
      g.deathTurn = requestedTurn * scale;
      g.deathTravel = travel * scale;
      break;
    }
  }
}
function updateGuard(g: Guard, b: BunkerState, dt: number) {
  g.startle = Math.max(0, g.startle - dt);
  const distance = Math.hypot(b.x - g.x, b.z - g.z);
  const bearing = Math.atan2(g.x - b.x, g.z - b.z);
  const visible = distance < 19 && sightLine(g.x, g.z, b.x, b.z);
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
  } else if (distance > 6.5) {
    const x = g.x,
      z = g.z;
    moveBody(
      g,
      ((b.x - g.x) / distance) * dt * 0.7,
      ((b.z - g.z) / distance) * dt * 0.7,
    );
    g.moving = Math.hypot(g.x - x, g.z - z) > 0.001;
  }
}
