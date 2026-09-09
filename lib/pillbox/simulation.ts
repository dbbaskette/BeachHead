import { infantryRoute } from './navigation';
import {
  AIM_BOUNDS,
  LANES,
  WAVE_COUNTS,
  type Infantry,
  type PillboxBattle,
  type PillboxEvent,
} from './types';

const SPAWN_Z = -132;
const BREACH_Z = -12;
const SPAWN_INTERVAL = 0.2;
const ADVANCE_SPEED = 3.5;
const COVER_TIME = 1.35;
const INTERMISSION_TIME = 2.5;
const FIRE_INTERVAL = 1 / 8;
const HIT_RADIUS = 2.3;
const HEAT_PER_SHOT = 2.5;
const HEAT_COOLING = 32;
const OVERHEAT_AT = 100;
const OVERHEAT_RELEASE = 30;
const BREACH_DAMAGE = 20;
const MAX_CORPSES = 18;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createPillboxBattle(): PillboxBattle {
  return {
    status: 'ready',
    time: 0,
    wave: 1,
    spawned: 0,
    spawnTimer: 0,
    intermission: 0,
    health: 100,
    heat: 0,
    overheated: false,
    cooldown: 0,
    shots: 0,
    hits: 0,
    kills: 0,
    score: 0,
    aimX: 0,
    aimZ: -70,
    message: 'Hold the beach. Press and hold to fire.',
    soldiers: [],
  };
}

export function aimPillbox(battle: PillboxBattle, x: number, z: number): void {
  if (Number.isFinite(x))
    battle.aimX = clamp(x, AIM_BOUNDS.minX, AIM_BOUNDS.maxX);
  if (Number.isFinite(z))
    battle.aimZ = clamp(z, AIM_BOUNDS.minZ, AIM_BOUNDS.maxZ);
}

function spawnSoldier(battle: PillboxBattle): void {
  const id =
    WAVE_COUNTS.slice(0, battle.wave - 1).reduce(
      (total, count) => total + count,
      0,
    ) +
    battle.spawned +
    1;
  const lane = (id * 2 + battle.wave) % LANES.length;
  battle.soldiers.push({
    id,
    x: LANES[lane] + ((id % 3) - 1) * 1.1,
    z: SPAWN_Z,
    lane,
    health: id % 3 === 0 ? 1 : 2,
    phase: 'advance',
    timer: 0,
    coverIndex: 0,
    waypoint: 0,
    offset: ((id % 3) - 1) * 1.1,
    speed: ADVANCE_SPEED * (0.92 + (id % 5) * 0.04),
  });
  battle.spawned += 1;
}

function moveSoldier(
  soldier: Infantry,
  dt: number,
  events: PillboxEvent[],
  battle: PillboxBattle,
): void {
  let remaining = dt;
  while (remaining > 1e-9 && soldier.phase !== 'breached') {
    if (soldier.phase === 'cover') {
      const used = Math.min(remaining, soldier.timer);
      soldier.timer -= used;
      remaining -= used;
      if (soldier.timer <= 1e-9) {
        soldier.phase = 'advance';
        soldier.coverIndex += 1;
      }
      continue;
    }
    if (soldier.phase !== 'advance') return;

    const route = infantryRoute(soldier.lane, soldier.offset);
    const target = route[soldier.waypoint];
    if (!target || soldier.z >= BREACH_Z) {
      soldier.phase = 'breached';
      battle.health = Math.max(0, battle.health - BREACH_DAMAGE);
      battle.message = `Breach! Bunker integrity ${battle.health}%.`;
      events.push({ type: 'breach', x: soldier.x, z: soldier.z });
      if (battle.health === 0) {
        battle.status = 'lost';
        battle.message = 'The pillbox has fallen.';
        events.push({ type: 'lost' });
      }
      return;
    }
    const dx = target.x - soldier.x,
      dz = target.z - soldier.z;
    const distance = Math.hypot(dx, dz);
    const travelTime = distance / soldier.speed;
    if (travelTime > remaining) {
      soldier.x += (dx / distance) * soldier.speed * remaining;
      soldier.z += (dz / distance) * soldier.speed * remaining;
      return;
    }
    soldier.x = target.x;
    soldier.z = target.z;
    remaining -= travelTime;
    soldier.waypoint += 1;
    if (target.cover) {
      soldier.phase = 'cover';
      soldier.timer = COVER_TIME + (soldier.id % 3) * 0.25;
    }
  }
}

function fireRound(battle: PillboxBattle, events: PillboxEvent[]): void {
  battle.shots += 1;
  battle.heat = Math.min(OVERHEAT_AT, battle.heat + HEAT_PER_SHOT);

  let target: Infantry | undefined;
  let nearest = Number.POSITIVE_INFINITY;
  for (const soldier of battle.soldiers) {
    if (soldier.phase === 'down' || soldier.phase === 'breached') continue;
    const distance = Math.hypot(
      soldier.x - battle.aimX,
      soldier.z - battle.aimZ,
    );
    if (distance <= HIT_RADIUS && distance < nearest) {
      nearest = distance;
      target = soldier;
    }
  }

  let hit = false;
  if (target?.phase === 'cover') {
    battle.message = 'Rounds strike cover. Wait for them to move.';
  } else if (target) {
    hit = true;
    battle.hits += 1;
    const precise = nearest <= 0.8;
    target.health -= precise ? 2 : 1;
    if (target.health <= 0) {
      target.health = 0;
      target.phase = 'down';
      target.timer = 0;
      battle.kills += 1;
      battle.score += 100 + battle.wave * 25;
      battle.message = 'Target down.';
      events.push({ type: 'down', id: target.id, x: target.x, z: target.z });
    } else {
      battle.message = 'Hit confirmed.';
    }
  } else {
    battle.message = 'Adjust fire.';
  }
  events.push({
    type: 'shot',
    x: hit && target ? target.x : battle.aimX,
    z: hit && target ? target.z : battle.aimZ,
    hit,
  });

  if (battle.heat >= OVERHEAT_AT) {
    battle.overheated = true;
    battle.message = 'Gun overheated. Cease fire.';
    events.push({ type: 'overheat' });
  }
}

function updateWave(
  battle: PillboxBattle,
  dt: number,
  events: PillboxEvent[],
): void {
  const waveCount = WAVE_COUNTS[battle.wave - 1];
  const active = battle.soldiers.some(
    (soldier) => soldier.phase === 'advance' || soldier.phase === 'cover',
  );
  if (battle.spawned < waveCount || active) return;

  if (battle.wave === WAVE_COUNTS.length) {
    battle.status = 'won';
    battle.message = 'Beach secured. All waves defeated.';
    events.push({ type: 'won' });
    return;
  }

  if (battle.intermission <= 0) {
    battle.intermission = INTERMISSION_TIME;
    battle.message = `Wave ${battle.wave} cleared. Cool the barrel and watch the surf.`;
  }
  battle.intermission = Math.max(0, battle.intermission - dt);
  if (battle.intermission === 0) {
    battle.wave += 1;
    battle.spawned = 0;
    battle.spawnTimer = 0;
    battle.message = `Wave ${battle.wave} incoming.`;
    events.push({ type: 'wave', wave: battle.wave });
  }
}

export function stepPillbox(
  battle: PillboxBattle,
  dt: number,
  firing: boolean,
): PillboxEvent[] {
  if (battle.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return [];

  const events: PillboxEvent[] = [];
  battle.time += dt;

  if (battle.intermission <= 0) {
    battle.spawnTimer -= dt;
    const count = WAVE_COUNTS[battle.wave - 1];
    while (battle.spawned < count && battle.spawnTimer <= 0) {
      spawnSoldier(battle);
      battle.spawnTimer += battle.spawned % 6 === 0 ? 2.4 : SPAWN_INTERVAL;
    }
  }

  for (const soldier of battle.soldiers) {
    if (battle.status !== 'playing') break;
    moveSoldier(soldier, dt, events, battle);
  }

  if (!firing || battle.overheated) {
    battle.heat = Math.max(0, battle.heat - HEAT_COOLING * dt);
    battle.cooldown = Math.max(0, battle.cooldown - dt);
    if (battle.overheated && battle.heat <= OVERHEAT_RELEASE) {
      battle.overheated = false;
      battle.message = 'Gun cooled. Ready to fire.';
    }
  } else if (battle.status === 'playing') {
    battle.cooldown -= dt;
    while (battle.cooldown <= 0 && !battle.overheated) {
      fireRound(battle, events);
      battle.cooldown += FIRE_INTERVAL;
    }
  }

  if (battle.status === 'playing') updateWave(battle, dt, events);

  const corpses = battle.soldiers.filter((soldier) => soldier.phase === 'down');
  if (corpses.length > MAX_CORPSES) {
    const remove = new Set(corpses.slice(0, corpses.length - MAX_CORPSES));
    battle.soldiers = battle.soldiers.filter((soldier) => !remove.has(soldier));
  }
  return events;
}
