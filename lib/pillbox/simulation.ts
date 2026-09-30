import {
  createLandingCraft,
  updateLandingCraft,
  nextInfantryId,
  infantryLane,
  RAMP_END_Z,
} from './landings';
import { infantryRoute } from './navigation';
import { FOXHOLES } from './foxholes';
import { terrainBlocksShot } from './terrain';
import {
  stopInfantry,
  stopJeep,
  updatePlayerWeapons,
  updateSupportReward,
} from './combat-actions';
import {
  damagePosition,
  rallySquad,
  updateInfantryTactics,
  updateFoxhole,
} from './squad-tactics';
import {
  AIM_BOUNDS,
  JEEP_HEALTH,
  grenadeFlight,
  grenadeImpactPoint,
  SMOKE_FLIGHT,
  SMOKE_LIFETIME,
  COVER_ROWS,
  LANES,
  WAVE_COUNTS,
  type Infantry,
  type PillboxBattle,
  type PillboxEvent,
} from './types';

const BREACH_Z = -12;
const SPAWN_INTERVAL = 0.2;
const ADVANCE_SPEED = 3.5;
const COVER_TIME = 1.35;
const FIRE_INTERVAL = 1 / 8;
const HIT_RADIUS = 2.3;
const HEAT_PER_SHOT = 2.9;
const HEAT_COOLING = 28;
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
    landingCraft: createLandingCraft(1),
    jeeps: [],
    grenades: [],
    smoke: [],
    jeepSpawned: 0,
    jeepTimer: 5,
    vehiclesStopped: 0,
    pendingInfantry: Array.from({ length: WAVE_COUNTS[0] }, (_, i) => i + 1),
    playerGrenades: [],
    grenadeAmmo: 3,
    grenadeCooldown: 0,
    nextProjectileId: 10000,
    barrelLevel: 0,
    supportProgress: 0,
    supportCredit: 0,
    airSupportCharges: 0,
    airStrike: null,
  };
}

export function aimPillbox(battle: PillboxBattle, x: number, z: number): void {
  if (Number.isFinite(x))
    battle.aimX = clamp(x, AIM_BOUNDS.minX, AIM_BOUNDS.maxX);
  if (Number.isFinite(z))
    battle.aimZ = clamp(z, AIM_BOUNDS.minZ, AIM_BOUNDS.maxZ);
}

function spawnSoldier(battle: PillboxBattle, id: number): void {
  const lane = infantryLane(id, battle.wave);
  const craft = battle.landingCraft.find((c) => c.lane === lane)!;
  const ordinal = id - nextInfantryId(battle.wave, 0);
  const role =
    ordinal === 5
      ? 'machine-gun'
      : battle.wave >= 2 && ordinal === 10
        ? 'mortar'
        : 'rifle';
  battle.soldiers.push({
    id,
    role,
    squadId: craft.id,
    attackTimer: 3 + (id % 4),
    x: LANES[lane] + ((id % 3) - 1) * 1.1,
    z: craft.z + 2,
    landingCraftId: craft.id,
    lane,
    health:
      role === 'machine-gun' ? 4 : role === 'mortar' ? 3 : id % 3 === 0 ? 1 : 2,
    phase: 'advance',
    timer: 0,
    coverIndex: 0,
    waypoint: 0,
    offset: ((id % 3) - 1) * 1.1,
    speed: ADVANCE_SPEED * (0.92 + (id % 5) * 0.04),
    grenadeState: 'ready',
    grenadeTimer: 0,
    usesFoxhole: role === 'rifle' && id % 3 !== 1,
  });
  craft.passengers--;
  battle.pendingInfantry = battle.pendingInfantry.filter((v) => v !== id);
  battle.spawned += 1;
}

export function jeepRoute(side: number) {
  return [
    { x: side * 10, z: -80 },
    { x: side * 18, z: -78 },
    { x: side * 18, z: -63 },
    { x: side * 10, z: -59 },
    { x: side * 10, z: -38 },
  ];
}

function reinforce(
  battle: PillboxBattle,
  jeep: PillboxBattle['jeeps'][number],
) {
  const slot = 4 - jeep.passengers;
  const id = 1000 + jeep.id * 10 + slot;
  const lane = jeep.side > 0 ? 3 : 1;
  const offset = ((slot % 3) - 1) * 1.1;
  battle.soldiers.push({
    id,
    x: jeep.x + (slot % 2 ? 2 : -2),
    z: jeep.z + slot * 0.6,
    lane,
    offset,
    health: 2,
    phase: 'advance',
    timer: 0,
    coverIndex: 2,
    waypoint: infantryRoute(lane, offset).length - 1,
    speed: ADVANCE_SPEED,
    grenadeState: 'ready',
    grenadeTimer: 0,
  });
  jeep.passengers--;
}

function updateJeeps(battle: PillboxBattle, dt: number) {
  battle.jeepTimer -= dt;
  if (battle.jeepSpawned < battle.wave && battle.jeepTimer <= 0) {
    const id = battle.wave * 10 + battle.jeepSpawned;
    const side = id % 2 ? -1 : 1;
    battle.jeeps.push({
      id,
      x: side * 10,
      z: -132,
      side,
      waypoint: 0,
      health: JEEP_HEALTH,
      passengers: 4,
      timer: 0.45,
      phase: 'driving',
    });
    battle.jeepSpawned++;
    battle.jeepTimer = 7;
  }
  for (const jeep of battle.jeeps) {
    if (jeep.phase === 'leaving') {
      const route = [{ x: jeep.side * 10, z: -145 }, ...jeepRoute(jeep.side)];
      let travel = dt * 10;
      while (travel > 0 && jeep.phase === 'leaving') {
        const point = route[jeep.waypoint];
        const dx = point.x - jeep.x,
          dz = point.z - jeep.z,
          distance = Math.hypot(dx, dz);
        if (distance > travel) {
          jeep.x += (dx / distance) * travel;
          jeep.z += (dz / distance) * travel;
          break;
        }
        jeep.x = point.x;
        jeep.z = point.z;
        travel -= distance;
        jeep.waypoint--;
        if (jeep.waypoint < 0) jeep.phase = 'gone';
      }
      continue;
    }
    if (jeep.phase === 'unloading') {
      jeep.timer -= dt;
      while (jeep.timer <= 0 && jeep.passengers > 0) {
        reinforce(battle, jeep);
        jeep.timer += 0.45;
      }
      if (!jeep.passengers) {
        jeep.phase = 'leaving';
        jeep.waypoint = jeepRoute(jeep.side).length - 1;
      }
      continue;
    }
    if (jeep.phase !== 'driving') continue;
    let remaining = dt * 9;
    const route = jeepRoute(jeep.side);
    while (remaining > 0 && jeep.phase === 'driving') {
      const point = route[jeep.waypoint];
      const dx = point.x - jeep.x,
        dz = point.z - jeep.z,
        distance = Math.hypot(dx, dz);
      if (distance > remaining) {
        jeep.x += (dx / distance) * remaining;
        jeep.z += (dz / distance) * remaining;
        break;
      }
      jeep.x = point.x;
      jeep.z = point.z;
      remaining -= distance;
      jeep.waypoint++;
      if (jeep.waypoint === route.length) jeep.phase = 'unloading';
    }
  }
}

function damageBunker(
  battle: PillboxBattle,
  amount: number,
  events: PillboxEvent[],
) {
  battle.health = Math.max(0, battle.health - amount);
  if (battle.health === 0) {
    battle.status = 'lost';
    battle.message = 'The pillbox has fallen.';
    events.push({ type: 'lost' });
  }
}

function updateGrenades(
  battle: PillboxBattle,
  dt: number,
  events: PillboxEvent[],
) {
  for (const grenade of battle.grenades) {
    grenade.age += dt;
    if (grenade.age >= grenadeFlight(grenade)) {
      events.push({
        type: 'grenade-impact',
        ...grenadeImpactPoint(grenade.id),
      });
      battle.message = 'Grenade hit! Stop throwers before they release.';
      damageBunker(battle, grenade.kind === 'mortar' ? 9 : 12, events);
      if (battle.status === 'lost') break;
    }
  }
  battle.grenades = battle.grenades.filter((g) => g.age < grenadeFlight(g));
}

function moveSoldier(
  soldier: Infantry,
  dt: number,
  events: PillboxEvent[],
  battle: PillboxBattle,
): void {
  if (soldier.landingCraftId !== undefined && soldier.phase === 'advance') {
    soldier.z = Math.min(RAMP_END_Z, soldier.z + soldier.speed * dt);
    if (soldier.z >= RAMP_END_Z) delete soldier.landingCraftId;
    return;
  }
  if (soldier.phase === 'down' || soldier.phase === 'breached') return;
  if (updateInfantryTactics(battle, soldier, dt, events)) return;
  // Stagger smoke carriers and throw locations so screens also form deeper inland.
  const smokeZone = [
    [-125, -112],
    [-76, -59],
    [-47, -42],
  ].findIndex(([near, far]) => soldier.z > near && soldier.z < far);
  const smokeCarrier =
    soldier.id < 1000 &&
    ((soldier.id % 6 === 1 && smokeZone !== 2) ||
      (soldier.id % 6 === 4 && smokeZone !== 0));
  if (
    soldier.phase === 'advance' &&
    smokeZone >= 0 &&
    smokeCarrier &&
    !((soldier.smokeMask ?? 0) & (1 << smokeZone))
  ) {
    if (soldier.smokeState !== 'windup') soldier.smokeTimer = 0;
    soldier.smokeState = 'windup';
    soldier.smokeTimer = (soldier.smokeTimer ?? 0) + dt;
    if (soldier.smokeTimer >= 1.1) {
      soldier.smokeState = 'spent';
      soldier.smokeMask = (soldier.smokeMask ?? 0) | (1 << smokeZone);
      battle.smoke.push({
        id: soldier.id * 4 + smokeZone,
        x: soldier.x,
        z: soldier.z,
        age: 0,
        targetX: soldier.x - Math.sign(soldier.x) * 2,
        targetZ: soldier.z + (smokeZone === 2 ? 7 : 10),
      });
      rallySquad(battle, soldier, 2.2);
      battle.message = 'Smoke screen! A squad is gathering for a rush.';
    }
    return;
  }
  soldier.crawling =
    Boolean(soldier.usesFoxhole) &&
    soldier.grenadeState !== 'windup' &&
    (COVER_ROWS.some((z) => soldier.z >= z - 11 && soldier.z < z + 3) ||
      Boolean(
        soldier.usesFoxhole &&
        FOXHOLES.some((h) => Math.hypot(soldier.x - h.x, soldier.z - h.z) < 7),
      ));
  if (
    soldier.phase === 'advance' &&
    soldier.z > -42 &&
    soldier.z < -13 &&
    soldier.grenadeState !== 'spent'
  ) {
    soldier.grenadeState = 'windup';
    soldier.grenadeTimer += dt;
    if (soldier.grenadeTimer >= 1.4) {
      soldier.grenadeState = 'spent';
      battle.grenades.push({
        id: soldier.id,
        x: soldier.x,
        z: soldier.z,
        age: 0,
      });
      battle.message = 'Grenade incoming!';
    }
    return;
  }
  let remaining = dt;
  while (remaining > 1e-9) {
    if (soldier.phase === 'cover') {
      if (soldier.foxholeId !== undefined)
        updateFoxhole(battle, soldier, remaining, events);
      const used = Math.min(remaining, soldier.timer);
      soldier.timer -= used;
      remaining -= used;
      if (soldier.timer <= 1e-9) {
        soldier.phase = 'advance';
        if (soldier.foxholeId === undefined) soldier.coverIndex += 1;
        else {
          rallySquad(battle, soldier, 0);
          for (const ally of battle.soldiers)
            if (
              ally.foxholeId === soldier.foxholeId &&
              ally.phase === 'cover' &&
              (ally.coverElapsed ?? 0) >= 8
            )
              ally.timer = 0;
          delete soldier.foxholeId;
        }
        soldier.exposed = false;
      }
      continue;
    }
    if (soldier.phase !== 'advance') return;

    const route = infantryRoute(
      soldier.lane,
      soldier.offset,
      soldier.usesFoxhole,
    );
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
    const speed =
      soldier.speed *
      (soldier.crawling
        ? 0.6
        : (soldier.rushUntil ?? 0) > battle.time
          ? 1.25
          : 1);
    const travelTime = distance / speed;
    if (travelTime > remaining) {
      soldier.x += (dx / distance) * speed * remaining;
      soldier.z += (dz / distance) * speed * remaining;
      return;
    }
    soldier.x = target.x;
    soldier.z = target.z;
    remaining -= travelTime;
    soldier.waypoint += 1;
    if (target.cover) {
      soldier.phase = 'cover';
      soldier.timer = COVER_TIME + (soldier.id % 3) * 0.25;
    } else if (target.foxhole !== undefined) {
      soldier.phase = 'cover';
      soldier.foxholeId = target.foxhole;
      soldier.timer = 9 + (soldier.id % 4) * 1.5;
      soldier.coverElapsed = 0;
      soldier.exposed = false;
    }
  }
}

function fireRound(battle: PillboxBattle, events: PillboxEvent[]): void {
  battle.shots += 1;
  battle.heat = Math.min(
    OVERHEAT_AT,
    battle.heat + HEAT_PER_SHOT * (1 - battle.barrelLevel * 0.1),
  );

  for (const s of battle.soldiers)
    if (
      s.phase === 'cover' &&
      Math.hypot(s.x - battle.aimX, s.z - battle.aimZ) < 4
    ) {
      if (!s.exposed) s.suppression = 0.8;
    }
  for (const c of battle.landingCraft) {
    if (c.phase === 'gone' || c.phase === 'withdrawing') continue;
    const gunner =
      c.gunnerHealth > 0 &&
      Math.hypot(c.x - 1.3 - battle.aimX, c.z - 4.5 - battle.aimZ) < 1.6;
    const ramp =
      c.rampHealth > 0 &&
      Math.hypot(c.x - battle.aimX, c.z + 6 - battle.aimZ) < 3;
    if (!gunner && !ramp) continue;
    if (gunner) {
      c.gunnerHealth--;
      battle.message = c.gunnerHealth
        ? 'Gunner hit.'
        : 'Craft gunner silenced.';
      if (!c.gunnerHealth) battle.score += 150;
    } else {
      c.rampHealth--;
      if (!c.rampHealth) {
        c.jamTimer = 7;
        battle.score += 150;
        battle.message = 'Ramp jammed! Unloading delayed seven seconds.';
      } else battle.message = `Ramp hit — ${c.rampHealth} hits to disable.`;
    }
    battle.hits++;
    events.push({
      type: 'shot',
      x: battle.aimX,
      z: battle.aimZ,
      hit: true,
      vehicle: true,
    });
    checkHeat(battle, events);
    return;
  }
  const vehicle = battle.jeeps.find(
    (j) =>
      (j.phase === 'driving' || j.phase === 'unloading') &&
      Math.hypot(j.x - battle.aimX, j.z - battle.aimZ) <= 3,
  );
  if (vehicle) {
    vehicle.health--;
    battle.hits++;
    events.push({
      type: 'shot',
      x: vehicle.x,
      z: vehicle.z,
      hit: true,
      vehicle: true,
    });
    battle.message = `Jeep hit — ${vehicle.health} armor remaining.`;
    if (vehicle.health <= 0) {
      stopJeep(battle, vehicle, events);
      battle.message = 'Jeep stopped. Reinforcements denied.';
    }
    checkHeat(battle, events);
    return;
  }

  let target: Infantry | undefined;
  let nearest = Number.POSITIVE_INFINITY;
  for (const soldier of battle.soldiers) {
    if (soldier.phase === 'down' || soldier.phase === 'breached') continue;
    const distance = Math.hypot(
      soldier.x - battle.aimX,
      soldier.z - battle.aimZ,
    );
    if (
      distance <= (soldier.crawling ? 1.35 : HIT_RADIUS) &&
      distance < nearest
    ) {
      nearest = distance;
      target = soldier;
    }
  }

  let hit = false;
  if (target?.phase === 'cover' && !target.exposed) {
    battle.message =
      target.foxholeId !== undefined
        ? 'Troops are below the foxhole rim. Use G or catch them peeking.'
        : 'Rounds strike cover. Wait for them to move.';
  } else if (
    target &&
    terrainBlocksShot(
      target.x,
      target.z,
      target.exposed ? 2.8 : target.crawling ? 0.55 : 1.7,
    )
  ) {
    battle.message =
      'The ridge blocks your shot. Watch for the target to emerge.';
  } else if (target) {
    hit = true;
    battle.hits += 1;
    const precise = nearest <= 0.8;
    target.health -= precise ? 2 : 1;
    if (target.health <= 0) {
      stopInfantry(battle, target, events);
      battle.message = 'Target down.';
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

  checkHeat(battle, events);
}
function checkHeat(battle: PillboxBattle, events: PillboxEvent[]) {
  if (battle.heat >= OVERHEAT_AT) {
    battle.overheated = true;
    battle.message = 'Gun overheated. Cease fire.';
    events.push({ type: 'overheat' });
  }
}

function updateWave(battle: PillboxBattle, events: PillboxEvent[]): void {
  const waveCount = WAVE_COUNTS[battle.wave - 1];
  const active = battle.soldiers.some(
    (soldier) => soldier.phase === 'advance' || soldier.phase === 'cover',
  );
  if (
    battle.spawned < waveCount ||
    active ||
    battle.jeepSpawned < battle.wave ||
    battle.jeeps.some(
      (j) => j.phase === 'driving' || j.phase === 'unloading',
    ) ||
    battle.grenades.length ||
    battle.playerGrenades.length ||
    battle.airStrike
  )
    return;

  if (battle.wave === WAVE_COUNTS.length) {
    battle.status = 'won';
    battle.message = 'Beach secured. All waves defeated.';
    events.push({ type: 'won' });
    return;
  }

  battle.status = 'resupply';
  battle.intermission = 1;
  battle.message = `Wave ${battle.wave} repelled. Choose supplies for the next assault.`;
  events.push({ type: 'wave-cleared' });
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
    updateLandingCraft(battle, dt);
    battle.spawnTimer -= dt;
    const count = WAVE_COUNTS[battle.wave - 1];
    while (battle.spawned < count && battle.spawnTimer <= 0) {
      let id =
        battle.pendingInfantry[0] ??
        nextInfantryId(battle.wave, battle.spawned);
      let craft = battle.landingCraft.find(
        (c) => c.lane === infantryLane(id, battle.wave),
      );
      if (craft?.jamTimer) {
        const available = battle.pendingInfantry.find((candidate) =>
          battle.landingCraft.some(
            (c) =>
              c.lane === infantryLane(candidate, battle.wave) &&
              c.phase === 'unloading' &&
              !c.jamTimer &&
              c.passengers,
          ),
        );
        if (available === undefined) {
          battle.spawnTimer = 0;
          break;
        }
        id = available;
        craft = battle.landingCraft.find(
          (c) => c.lane === infantryLane(id, battle.wave),
        );
      }
      if (
        !craft ||
        craft.phase !== 'unloading' ||
        !craft.passengers ||
        craft.jamTimer
      ) {
        battle.spawnTimer = 0;
        break;
      }
      spawnSoldier(battle, id);
      battle.spawnTimer += battle.spawned % 6 === 0 ? 2.4 : SPAWN_INTERVAL;
    }
  }

  if (battle.intermission <= 0) updateJeeps(battle, dt);
  for (const c of battle.landingCraft)
    if (c.phase === 'unloading' && c.gunnerHealth > 0 && c.passengers > 0) {
      c.attackTimer -= dt;
      if (c.attackTimer <= 0) {
        c.attackTimer = 6;
        events.push({ type: 'enemy-fire', x: c.x - 1.3, z: c.z - 4.5 });
        damagePosition(battle, 2, events);
      }
    }
  updatePlayerWeapons(battle, dt, events);
  updateGrenades(battle, dt, events);
  for (const smoke of battle.smoke) smoke.age += dt;
  battle.smoke = battle.smoke.filter(
    (s) => s.age < SMOKE_FLIGHT + SMOKE_LIFETIME,
  );

  for (const soldier of battle.soldiers) {
    if (battle.status !== 'playing') break;
    moveSoldier(soldier, dt, events, battle);
  }

  if (!firing || battle.overheated) {
    battle.heat = Math.max(
      0,
      battle.heat - (HEAT_COOLING + battle.barrelLevel * 4) * dt,
    );
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

  updateSupportReward(battle, events);
  if (battle.status === 'playing') updateWave(battle, events);

  const corpses = battle.soldiers.filter((soldier) => soldier.phase === 'down');
  if (corpses.length > MAX_CORPSES) {
    const remove = new Set(corpses.slice(0, corpses.length - MAX_CORPSES));
    battle.soldiers = battle.soldiers.filter((soldier) => !remove.has(soldier));
  }
  return events;
}
