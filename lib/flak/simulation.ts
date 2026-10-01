export type Vec = { x: number; y: number; z: number };
export type Aircraft = Vec & {
  id: number;
  kind: 'bomber' | 'transport';
  vx: number;
  vz: number;
  health: number;
  age: number;
  falling: number;
  payload: number;
  dropClock: number;
  hit: Vec | null;
};
export type Trooper = Vec & {
  id: number;
  age: number;
  health: number;
  vy: number;
};
export type Round = Vec & {
  id: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
};
export type FlakEvent = {
  kind: 'shot' | 'hit' | 'burst' | 'crash' | 'damage';
  at: Vec;
};
export type FlakState = {
  status: 'ready' | 'playing' | 'paused' | 'won' | 'lost';
  time: number;
  yaw: number;
  pitch: number;
  integrity: number;
  magazine: number;
  reload: number;
  cooldown: number;
  fired: number;
  downed: number;
  stopped: number;
  next: number;
  serial: number;
  planes: Aircraft[];
  troops: Trooper[];
  rounds: Round[];
  bombs: Round[];
  events: FlakEvent[];
};
export const RAIDS = [
  0, 3.5, 9, 15, 20, 34, 37, 42, 47, 53, 64, 67, 72, 77, 82, 87, 92,
];
export const SPEED = 820;
export const GRAVITY = 9.81;
export const EYE = { x: 0, y: 6.1, z: 6.5 };
export function eyePosition(s: Pick<FlakState, 'yaw'>): Vec {
  return { x: -Math.sin(s.yaw) * 2.5, y: EYE.y, z: 4 + Math.cos(s.yaw) * 2.5 };
}
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export function createFlak(): FlakState {
  return {
    status: 'ready',
    time: 0,
    yaw: -0.96,
    pitch: 0.37,
    integrity: 100,
    magazine: 80,
    reload: 0,
    cooldown: 0,
    fired: 0,
    downed: 0,
    stopped: 0,
    next: 0,
    serial: 0,
    planes: [],
    troops: [],
    rounds: [],
    bombs: [],
    events: [],
  };
}
export function aimFlak(s: FlakState, yaw: number, pitch: number) {
  s.yaw = Math.atan2(Math.sin(s.yaw + yaw), Math.cos(s.yaw + yaw));
  s.pitch = clamp(s.pitch + pitch, 0.04, 1.43);
}
export function aimDirection(s: Pick<FlakState, 'yaw' | 'pitch'>): Vec {
  return {
    x: Math.sin(s.yaw) * Math.cos(s.pitch),
    y: Math.sin(s.pitch),
    z: -Math.cos(s.yaw) * Math.cos(s.pitch),
  };
}
export function muzzle(s: FlakState): Vec {
  const side = s.fired % 2 ? 0.46 : -0.46;
  const height = Math.floor(s.fired / 2) % 2 ? 0.4 : 0;
  const forward = 3.105 * Math.cos(s.pitch) - height * Math.sin(s.pitch);
  return {
    x: Math.sin(s.yaw) * forward + Math.cos(s.yaw) * side,
    y: 5.9 + height * Math.cos(s.pitch) + 3.105 * Math.sin(s.pitch),
    z: 4 - Math.cos(s.yaw) * forward + Math.sin(s.yaw) * side,
  };
}
function shoot(s: FlakState) {
  if (s.reload > 0 || s.cooldown > 1e-7) return;
  const p = muzzle(s),
    d = aimDirection(s);
  // Converge the four bores at the sight's 600 m zero, including gravity drop.
  const eye = eyePosition(s);
  const dx = eye.x + d.x * 600 - p.x,
    dy = eye.y + d.y * 600 + 0.5 * GRAVITY * (600 / SPEED) ** 2 - p.y,
    dz = eye.z + d.z * 600 - p.z;
  const length = Math.hypot(dx, dy, dz);
  s.rounds.push({
    ...p,
    id: ++s.serial,
    vx: (dx / length) * SPEED,
    vy: (dy / length) * SPEED,
    vz: (dz / length) * SPEED,
    age: 0,
  });
  s.events.push({ kind: 'shot', at: p });
  s.fired++;
  s.magazine--;
  s.cooldown = 0.075;
  if (!s.magazine) s.reload = 3.2;
}
export function spawnAircraft(s: FlakState, index: number) {
  const kind = [0, 1, 4, 6, 9, 11, 14].includes(index) ? 'transport' : 'bomber';
  const side = index % 2 ? 1 : -1;
  s.planes.push({
    id: ++s.serial,
    kind,
    x: side * (kind === 'bomber' ? 360 : 340),
    y: kind === 'bomber' ? 180 : 155 + index * 3,
    z: kind === 'bomber' ? -660 : -190 - (index % 3) * 15,
    vx: -side * (kind === 'bomber' ? 30 : 43),
    vz: kind === 'bomber' ? 55 : 0,
    health: kind === 'bomber' ? 5 : 4,
    age: 0,
    falling: 0,
    payload: kind === 'bomber' ? 1 : 4,
    dropClock: 0,
    hit: null,
  });
}
/** First segment intersection with an ellipsoid; tests swept rounds rather than frame endpoints. */
export function ellipsoidHit(a: Vec, b: Vec, radius: Vec): number | null {
  const p = { x: a.x / radius.x, y: a.y / radius.y, z: a.z / radius.z },
    d = {
      x: (b.x - a.x) / radius.x,
      y: (b.y - a.y) / radius.y,
      z: (b.z - a.z) / radius.z,
    };
  const A = d.x * d.x + d.y * d.y + d.z * d.z,
    B = 2 * (p.x * d.x + p.y * d.y + p.z * d.z),
    C = p.x * p.x + p.y * p.y + p.z * p.z - 1;
  if (C <= 0) return 0;
  if (A < 1e-12) return null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}
function planeHit(a: Vec, b: Vec, p: Aircraft, dt: number) {
  const length = Math.hypot(p.vx, p.vz),
    fx = p.vx / length,
    fz = p.vz / length;
  const local = (v: Vec, old: boolean): Vec => {
    const x = v.x - p.x + (old ? p.vx * dt : 0),
      z = v.z - p.z + (old ? p.vz * dt : 0);
    return { x: -fz * x + fx * z, y: v.y - p.y, z: fx * x + fz * z };
  };
  const from = local(a, true),
    to = local(b, false);
  const hits = [
    ellipsoidHit(from, to, { x: 1.6, y: 1.7, z: p.kind === 'bomber' ? 8 : 10 }),
    ellipsoidHit(from, to, {
      x: p.kind === 'bomber' ? 10.5 : 14.7,
      y: 1.1,
      z: 2.4,
    }),
  ].filter((v): v is number => v !== null);
  return hits.length ? Math.min(...hits) : null;
}
export function stepFlak(s: FlakState, seconds: number, firing = false) {
  s.events = [];
  if (s.status !== 'playing') return;
  // Bounded substeps preserve fire rate and ballistic collisions through slow frames.
  let remaining = clamp(seconds, 0, 0.15);
  while (remaining > 1e-7 && s.status === 'playing') {
    const dt = Math.min(remaining, 1 / 120);
    remaining -= dt;
    s.time += dt;
    s.cooldown = Math.max(0, s.cooldown - dt);
    if (s.reload > 0) {
      s.reload = Math.max(0, s.reload - dt);
      if (!s.reload) s.magazine = 80;
    }
    while (s.next < RAIDS.length && s.time >= RAIDS[s.next])
      spawnAircraft(s, s.next++);
    if (firing) shoot(s);
    for (const p of s.planes) {
      p.age += dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      if (p.health <= 0) {
        p.falling += dt;
        p.y -= (8 + p.falling * GRAVITY) * dt;
        if (p.y <= 0) {
          p.y = -999;
          s.events.push({ kind: 'crash', at: { x: p.x, y: 0, z: p.z } });
        }
        continue;
      }
      if (
        p.kind === 'bomber' &&
        p.payload &&
        p.z + p.vz * Math.sqrt((2 * p.y) / GRAVITY) >= -8
      ) {
        s.bombs.push({
          id: ++s.serial,
          x: p.x,
          y: p.y - 1,
          z: p.z,
          vx: p.vx,
          vy: 0,
          vz: p.vz,
          age: 0,
        });
        p.payload = 0;
      }
      if (p.kind === 'transport' && p.payload && Math.abs(p.x) < 150) {
        p.dropClock -= dt;
        if (p.dropClock <= 0) {
          s.troops.push({
            id: ++s.serial,
            x: p.x,
            y: p.y - 3,
            z: p.z,
            age: 0,
            health: 1,
            vy: 0,
          });
          p.payload--;
          p.dropClock = 1.1;
        }
      }
      if (Math.abs(p.x) > 850 || p.z > 260) {
        s.integrity -= p.kind === 'transport' ? 4 : 2;
        p.y = -999;
      }
    }
    for (const p of s.troops) {
      p.age += dt;
      p.vy =
        p.health <= 0
          ? p.vy - GRAVITY * dt
          : p.age < 0.65
            ? p.vy - GRAVITY * dt
            : -5.8;
      p.y += p.vy * dt;
      p.x += dt * (p.health > 0 ? 2.8 : 1);
      p.z += dt * (p.health > 0 ? 6 : 2);
      if (p.y <= 0 && p.health > 0) {
        s.integrity -= 7;
        p.health = 0;
        p.y = -999;
        s.events.push({ kind: 'damage', at: { x: p.x, y: 0, z: p.z } });
      }
    }
    for (const b of s.bombs) {
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.y += b.vy * dt - 0.5 * GRAVITY * dt * dt;
      b.vy -= GRAVITY * dt;
      if (b.y <= 0 && b.age !== -1) {
        const distance = Math.hypot(b.x, b.z);
        s.integrity -= Math.max(6, 26 - distance * 0.22);
        s.events.push({ kind: 'damage', at: { x: b.x, y: 0, z: b.z } });
        b.age = -1;
      }
    }
    for (const r of s.rounds) {
      const old = { x: r.x, y: r.y, z: r.z };
      r.age += dt;
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      r.y += r.vy * dt - 0.5 * GRAVITY * dt * dt;
      r.vy -= GRAVITY * dt;
      let nearest = 2;
      let victim: Aircraft | Trooper | null = null;
      for (const p of s.planes)
        if (p.health > 0) {
          const t = planeHit(old, r, p, dt);
          if (t !== null && t < nearest) {
            nearest = t;
            victim = p;
          }
        }
      for (const p of s.troops)
        if (p.health > 0) {
          const center = { x: p.x, y: p.y + (p.age > 0.65 ? 3 : 0), z: p.z };
          const t = ellipsoidHit(
            { x: old.x - center.x, y: old.y - center.y, z: old.z - center.z },
            { x: r.x - center.x, y: r.y - center.y, z: r.z - center.z },
            p.age > 0.65
              ? { x: 3.8, y: 4, z: 3.8 }
              : { x: 0.7, y: 1.1, z: 0.7 },
          );
          if (t !== null && t < nearest) {
            nearest = t;
            victim = p;
          }
        }
      if (victim) {
        const at = {
          x: old.x + (r.x - old.x) * nearest,
          y: old.y + (r.y - old.y) * nearest,
          z: old.z + (r.z - old.z) * nearest,
        };
        victim.health--;
        r.age = 99;
        s.events.push({ kind: 'hit', at });
        if ('kind' in victim) {
          victim.hit = {
            x: at.x - victim.x,
            y: at.y - victim.y,
            z: at.z - victim.z,
          };
          if (victim.health === 0) s.downed++;
        } else if (victim.health === 0) s.stopped++;
      } else if (r.age > 2.2) {
        s.events.push({ kind: 'burst', at: { x: r.x, y: r.y, z: r.z } });
        r.age = 99;
      }
    }
    s.planes = s.planes.filter((p) => p.y > 0);
    s.troops = s.troops.filter((p) => p.y > 0);
    s.bombs = s.bombs.filter((p) => p.age !== -1);
    s.rounds = s.rounds.filter((r) => r.age < 3);
    s.integrity = clamp(s.integrity, 0, 100);
    if (!s.integrity) s.status = 'lost';
    else if (
      s.next === RAIDS.length &&
      !s.planes.length &&
      !s.troops.length &&
      !s.bombs.length
    )
      s.status = 'won';
  }
}
