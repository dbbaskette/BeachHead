import {
  village,
  ENEMY_SEEDS,
  BRIDGE,
  SUPPLY,
  type Point,
  type Cover,
  type EnemyKind,
} from './map';
export type TankInput = {
  drive: number;
  steer: number;
  turn: number;
  pitch: number;
  fire: boolean;
  repair: boolean;
};
export const emptyTankInput = (): TankInput => ({
  drive: 0,
  steer: 0,
  turn: 0,
  pitch: 0,
  fire: false,
  repair: false,
});
export type Enemy = Point & {
  id: number;
  kind: EnemyKind;
  health: number;
  yaw: number;
  cooldown: number;
  warning: number;
  active: boolean;
  reserve: boolean;
  alerted: boolean;
  aim: Point;
};
export type Shell = Point & {
  id: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  enemy: boolean;
  mg: boolean;
  damage: number;
  source: EnemyKind | 'player';
};
export type TankEvent = {
  kind:
    | 'cannon'
    | 'mg'
    | 'impact'
    | 'ricochet'
    | 'destroy'
    | 'damage'
    | 'warning'
    | 'repair'
    | 'win';
  at: Point;
  strength: number;
};
export type TankState = {
  status: 'ready' | 'playing' | 'paused' | 'won' | 'lost';
  time: number;
  x: number;
  z: number;
  yaw: number;
  turret: number;
  pitch: number;
  speed: number;
  distance: number;
  health: number;
  track: number;
  turretDamage: number;
  repair: number;
  weapon: 'cannon' | 'mg';
  reload: number;
  heat: number;
  recoil: number;
  serial: number;
  cover: Cover[];
  enemies: Enemy[];
  shells: Shell[];
  events: TankEvent[];
  phase: 'advance' | 'secure' | 'hold';
  demolition: number;
  hold: number;
  supplied: boolean;
  reason: string;
  kills: number;
};
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export function createTank(): TankState {
  return {
    status: 'ready',
    time: 0,
    x: 0,
    z: 18,
    yaw: 0,
    turret: 0,
    pitch: -0.015,
    speed: 0,
    distance: 0,
    health: 100,
    track: 0,
    turretDamage: 0,
    repair: 0,
    weapon: 'cannon',
    reload: 0,
    heat: 0,
    recoil: 0,
    serial: 100,
    cover: village(),
    enemies: ENEMY_SEEDS.map((e, i) => ({
      ...e,
      id: i + 1,
      health:
        e.kind === 'tank'
          ? 210
          : e.kind === 'gun'
            ? 95
            : e.kind === 'demolition'
              ? 150
              : 32,
      cooldown: 2 + i * 0.17,
      warning: 0,
      active: !e.reserve,
      reserve: !!e.reserve,
      alerted: false,
      aim: { x: 0, y: 1.7, z: 18 },
    })),
    shells: [],
    events: [],
    phase: 'advance',
    demolition: 240,
    hold: 0,
    supplied: false,
    reason: '',
    kills: 0,
  };
}
export function aimTank(s: TankState, yaw: number, pitch: number) {
  if (s.status === 'playing') {
    s.turret = angle(s.turret + yaw * (s.turretDamage ? 0.4 : 1));
    s.pitch = clamp(s.pitch + pitch, -0.16, 0.35);
  }
}
export function tankMuzzle(s: TankState): Point {
  return {
    x: s.x + Math.sin(s.turret) * 4.25,
    y: 2.65 + Math.sin(s.pitch) * 3,
    z: s.z - Math.cos(s.turret) * 4.25,
  };
}
export function segmentBox(
  a: Point,
  b: Point,
  box: Point,
  half: Point,
): number | null {
  let lo = 0,
    hi = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = b[axis] - a[axis],
      min = box[axis] - half[axis],
      max = box[axis] + half[axis];
    if (Math.abs(d) < 1e-9) {
      if (a[axis] < min || a[axis] > max) return null;
    } else {
      let t1 = (min - a[axis]) / d,
        t2 = (max - a[axis]) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      lo = Math.max(lo, t1);
      hi = Math.min(hi, t2);
      if (lo > hi) return null;
    }
  }
  return lo;
}
function coverHit(a: Point, b: Point, c: Cover) {
  return c.health > 0
    ? segmentBox(a, b, c, { x: c.w / 2, y: c.h / 2, z: c.d / 2 })
    : null;
}
function event(s: TankState, kind: TankEvent['kind'], at: Point, strength = 1) {
  s.events.push({ kind, at: { ...at }, strength });
}
function breakCover(s: TankState, c: Cover, damage: number, at: Point) {
  if (c.kind === 'hedge') return;
  c.health -= damage;
  event(
    s,
    c.health <= 0 ? 'destroy' : 'impact',
    at,
    c.kind === 'house' ? 2 : 1,
  );
}
export function damagePlayer(
  s: TankState,
  damage: number,
  from: Point,
  source: EnemyKind | 'player',
) {
  const bearing = Math.atan2(from.x - s.x, -(from.z - s.z));
  const incidence = Math.cos(angle(bearing - s.yaw));
  // Front glacis is stronger; grazing front hits can glance off. Flanks stay vulnerable.
  if (source === 'gun' && incidence > 0.9) {
    s.health -= damage * 0.17;
    event(s, 'ricochet', { x: s.x, y: 1.8, z: s.z }, 0.8);
  } else {
    s.health -=
      damage * (incidence > 0.65 ? 0.48 : incidence < -0.6 ? 1.15 : 0.85);
    event(s, 'damage', { x: s.x, y: 1.6, z: s.z }, 1);
  }
  if (source === 'rocket' && s.track === 0) s.track = 1;
  if (source === 'tank' && s.turretDamage === 0) s.turretDamage = 1;
}
function fire(s: TankState) {
  if (s.reload > 0 || s.repair > 0 || (s.weapon === 'mg' && s.heat >= 0.98))
    return;
  const mg = s.weapon === 'mg',
    p = tankMuzzle(s),
    v = mg ? 410 : 260;
  s.shells.push({
    ...p,
    id: ++s.serial,
    vx: Math.sin(s.turret) * Math.cos(s.pitch) * v,
    vy: Math.sin(s.pitch) * v,
    vz: -Math.cos(s.turret) * Math.cos(s.pitch) * v,
    age: 0,
    enemy: false,
    mg,
    damage: mg ? 12 : 95,
    source: 'player',
  });
  s.reload = mg ? 0.095 : 3.6;
  if (mg) s.heat = Math.min(1, s.heat + 0.045);
  else s.recoil = 1;
  event(s, mg ? 'mg' : 'cannon', p, 1);
}
function enemyHit(s: TankState, e: Enemy, r: Shell, at: Point) {
  if (e.health <= 0) return;
  let damage = r.damage;
  if (e.kind === 'tank') {
    if (r.mg) {
      event(s, 'ricochet', at, 0.25);
      return;
    }
    const incoming = Math.atan2(-r.vx, r.vz),
      front = Math.cos(angle(incoming - e.yaw));
    damage *= front > 0.65 ? 0.65 : 1.3;
  } else if (e.kind === 'gun' && r.mg) damage *= 0.4;
  e.health -= damage;
  event(s, e.health <= 0 ? 'destroy' : 'impact', at, e.kind === 'tank' ? 2 : 1);
  if (e.health <= 0) {
    e.warning = 0;
    s.kills++;
  }
}
function updateEnemies(s: TankState, dt: number) {
  for (const e of s.enemies) {
    if (!e.active || e.health <= 0 || e.kind === 'demolition') continue;
    const distance = Math.hypot(e.x - s.x, e.z - s.z);
    const player = { x: s.x, y: 1.7, z: s.z };
    const visible =
      distance < (e.kind === 'rocket' ? 85 : 145) &&
      !s.cover.some((c) => coverHit(e, player, c) !== null);
    if (e.kind === 'tank' && visible) {
      e.yaw +=
        angle(Math.atan2(s.x - e.x, -(s.z - e.z)) - e.yaw) *
        Math.min(1, dt * 0.45);
      if (distance > 48) e.z += dt * 1.6;
    }
    if (e.warning > 0) {
      e.warning -= dt;
      if (e.warning <= 0) {
        const p = { x: e.x, y: e.y + 0.2, z: e.z },
          speed = e.kind === 'rocket' ? 53 : 140;
        const dx = e.aim.x - p.x,
          dz = e.aim.z - p.z,
          flight = Math.hypot(dx, dz) / speed,
          dy = e.aim.y - p.y + 0.5 * 9.81 * flight * flight;
        const length = Math.hypot(dx, dy, dz);
        s.shells.push({
          ...p,
          id: ++s.serial,
          vx: (dx / length) * speed,
          vy: (dy / length) * speed,
          vz: (dz / length) * speed,
          age: 0,
          enemy: true,
          mg: false,
          damage: e.kind === 'tank' ? 26 : e.kind === 'gun' ? 20 : 18,
          source: e.kind,
        });
        event(s, 'cannon', p, 0.65);
        e.cooldown = e.kind === 'rocket' ? 7 : 9;
      }
    } else if (visible) {
      e.cooldown -= dt;
      if (e.cooldown <= 0) {
        e.warning = e.kind === 'rocket' ? 2.3 : 1.8;
        e.alerted = true;
        e.aim = player;
        event(s, 'warning', e, 0.4);
      }
    }
  }
}
function step(s: TankState, dt: number, input: TankInput) {
  s.time += dt;
  s.reload = Math.max(0, s.reload - dt);
  s.heat = Math.max(0, s.heat - dt * 0.14);
  s.recoil = Math.max(0, s.recoil - dt * 3);
  aimTank(s, input.turn * dt * 0.72, input.pitch * dt * 0.24);
  const driving = Math.abs(input.drive) + Math.abs(input.steer) > 0.08;
  if (input.repair && (s.track || s.turretDamage) && !driving && !input.fire) {
    s.repair += dt;
    s.speed *= Math.max(0, 1 - dt * 8);
    if (s.repair >= 4.5) {
      s.track = 0;
      s.turretDamage = 0;
      s.repair = 0;
      event(s, 'repair', { x: s.x, y: 1, z: s.z });
    }
  } else s.repair = 0;
  const target =
    input.drive *
    (input.drive < 0 ? 2.6 : 5.8) *
    (s.track ? 0.08 : 1) *
    (s.repair > 0 ? 0 : 1);
  s.speed += (target - s.speed) * Math.min(1, dt * (input.drive ? 1.2 : 2.8));
  s.yaw = angle(s.yaw + input.steer * dt * 0.55 * (s.track ? 0.18 : 1));
  const nx = s.x + Math.sin(s.yaw) * s.speed * dt,
    nz = s.z - Math.cos(s.yaw) * s.speed * dt;
  let blocked =
    nx < -83 ||
    nx > 65 ||
    nz > 30 ||
    nz < -375 ||
    (nz < -309 && nz > -335 && Math.abs(nx) > 5.4);
  for (const c of s.cover) {
    if (c.health <= 0) continue;
    if (
      Math.abs(nx - c.x) < c.w / 2 + 1.7 &&
      Math.abs(nz - c.z) < c.d / 2 + 2.1
    ) {
      if (
        (c.kind === 'fence' || c.kind === 'wall') &&
        Math.abs(s.speed) > 1.2
      ) {
        breakCover(s, c, Math.abs(s.speed) * dt * 48, { x: nx, y: 1, z: nz });
        s.speed *= 0.98;
        if (c.health > 0) blocked = true;
      } else blocked = true;
    }
  }
  if (!blocked) {
    s.x = nx;
    s.z = nz;
    s.distance += Math.abs(s.speed) * dt;
  } else s.speed *= Math.max(0, 1 - dt * 4);
  if (input.fire) fire(s);
  updateEnemies(s, dt);
  for (const r of s.shells) {
    const old = { x: r.x, y: r.y, z: r.z };
    r.age += dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt - 0.5 * 9.81 * dt * dt;
    r.z += r.vz * dt;
    r.vy -= 9.81 * dt;
    let nearest = 2;
    let victim: Cover | Enemy | 'player' | null = null;
    for (const c of s.cover) {
      const t = coverHit(old, r, c);
      if (t !== null && t < nearest) {
        nearest = t;
        victim = c;
      }
    }
    if (r.enemy) {
      const t = segmentBox(
        old,
        r,
        { x: s.x, y: 1.5, z: s.z },
        { x: 1.8, y: 1.5, z: 2.7 },
      );
      if (t !== null && t < nearest) {
        nearest = t;
        victim = 'player';
      }
    } else
      for (const e of s.enemies) {
        if (!e.active || e.health <= 0) continue;
        const t = segmentBox(
          old,
          r,
          e,
          e.kind === 'tank'
            ? { x: 1.8, y: 1.6, z: 3 }
            : e.kind === 'demolition'
              ? { x: 2, y: 1.8, z: 2 }
              : e.kind === 'gun'
                ? { x: 1.5, y: 1.1, z: 1.5 }
                : { x: 0.65, y: 1.1, z: 0.65 },
        );
        if (t !== null && t < nearest) {
          nearest = t;
          victim = e;
        }
      }
    if (victim) {
      const at = {
        x: old.x + (r.x - old.x) * nearest,
        y: old.y + (r.y - old.y) * nearest,
        z: old.z + (r.z - old.z) * nearest,
      };
      if (victim === 'player')
        damagePlayer(
          s,
          r.damage,
          { x: old.x - r.vx, y: old.y, z: old.z - r.vz },
          r.source,
        );
      else if ('maxHealth' in victim)
        breakCover(s, victim, r.mg ? 2 : r.damage, at);
      else enemyHit(s, victim, r, at);
      r.age = 99;
    } else if (r.y <= 0) {
      event(s, 'impact', { x: r.x, y: 0, z: r.z }, r.mg ? 0.12 : 0.7);
      r.age = 99;
    }
  }
  s.shells = s.shells.filter((r) => r.age < 5);
  const demo = s.enemies.find((e) => e.kind === 'demolition')!;
  if (demo.health <= 0 && s.phase === 'advance') s.phase = 'secure';
  if (s.z < -100 && demo.health > 0) {
    s.demolition = Math.max(0, s.demolition - dt);
    if (!s.demolition) {
      s.status = 'lost';
      s.reason = 'The engineers demolished the bridge.';
      event(s, 'destroy', { x: 0, y: 0, z: -320 }, 4);
    }
  }
  const nearBridge = Math.hypot(s.x - BRIDGE.x, s.z - BRIDGE.z) < 23;
  if (s.phase === 'secure' && nearBridge) {
    s.phase = 'hold';
    for (const e of s.enemies) if (e.reserve) e.active = true;
  }
  if (s.phase === 'hold' && nearBridge) {
    s.hold = Math.min(40, s.hold + dt);
    if (
      s.hold >= 40 &&
      !s.enemies.some(
        (e) => e.active && e.health > 0 && Math.hypot(e.x, e.z + 320) < 65,
      )
    ) {
      s.status = 'won';
      event(s, 'win', { x: s.x, y: 2, z: s.z });
    }
  }
  if (
    !s.supplied &&
    Math.hypot(s.x - SUPPLY.x, s.z - SUPPLY.z) < 7 &&
    Math.abs(s.speed) < 1
  ) {
    s.health = Math.min(100, s.health + 35);
    s.supplied = true;
    event(s, 'repair', { x: s.x, y: 1, z: s.z });
  }
  s.health = clamp(s.health, 0, 100);
  if (!s.health) {
    s.status = 'lost';
    s.reason = 'Your Sherman was knocked out.';
  }
}
export function stepTank(
  s: TankState,
  seconds: number,
  input = emptyTankInput(),
) {
  s.events = [];
  if (s.status !== 'playing') return;
  let remaining = clamp(seconds, 0, 0.15);
  while (remaining > 1e-8 && s.status === 'playing') {
    const dt = Math.min(1 / 60, remaining);
    remaining -= dt;
    step(s, dt, input);
  }
}
export function objective(s: TankState) {
  return s.phase === 'advance'
    ? 'Destroy the demolition post by the bridge'
    : s.phase === 'secure'
      ? 'Move into the bridge square'
      : s.hold < 40
        ? `Hold the bridge · ${Math.ceil(40 - s.hold)}s`
        : 'Clear the remaining bridge defenders';
}
