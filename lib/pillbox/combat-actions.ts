import { createLandingCraft, nextInfantryId } from './landings';
import {
  PLAYER_GRENADE_FLIGHT,
  PLAYER_GRENADE_RANGE,
  SUPPORT_REQUIRED,
  WAVE_COUNTS,
  type Infantry,
  type PillboxBattle,
  type PillboxEvent,
  type SupplyChoice,
} from './types';

export function stopInfantry(
  b: PillboxBattle,
  s: Infantry,
  events: PillboxEvent[],
) {
  if (s.phase === 'down' || s.phase === 'breached') return;
  s.health = 0;
  s.phase = 'down';
  s.timer = 0;
  s.exposed = false;
  b.kills++;
  b.score += 100 + b.wave * 25 + (s.role && s.role !== 'rifle' ? 150 : 0);
  events.push({ type: 'down', id: s.id, x: s.x, z: s.z });
}

export function stopJeep(
  b: PillboxBattle,
  j: PillboxBattle['jeeps'][number],
  events: PillboxEvent[],
) {
  if (j.phase === 'wreck' || j.phase === 'gone') return;
  j.health = 0;
  j.phase = 'wreck';
  j.passengers = 0;
  b.vehiclesStopped++;
  b.score += 400;
  events.push({ type: 'jeep-destroyed', x: j.x, z: j.z });
}

export function throwPlayerGrenade(b: PillboxBattle): boolean {
  if (b.status !== 'playing' || b.grenadeAmmo <= 0 || b.grenadeCooldown > 0)
    return false;
  if (Math.hypot(b.aimX, b.aimZ) > PLAYER_GRENADE_RANGE) {
    b.message = 'Grenade out of range. Aim within 115 meters.';
    return false;
  }
  b.grenadeAmmo--;
  b.grenadeCooldown = 1.7;
  b.playerGrenades.push({
    id: b.nextProjectileId++,
    x: b.aimX,
    z: b.aimZ,
    age: 0,
  });
  b.message = 'Grenade away!';
  return true;
}

export function callAirSupport(b: PillboxBattle): boolean {
  if (b.status !== 'playing' || !b.airSupportCharges || b.airStrike)
    return false;
  b.airSupportCharges--;
  b.airStrike = {
    x: b.aimX,
    z: Math.max(-132, Math.min(-30, b.aimZ)),
    age: 0,
    passes: 0,
  };
  b.message = 'Air support inbound. Strafing the marked line!';
  return true;
}

function areaDamage(
  b: PillboxBattle,
  x: number,
  z: number,
  radius: number,
  events: PillboxEvent[],
) {
  for (const s of b.soldiers)
    if (Math.hypot(s.x - x, s.z - z) <= radius) stopInfantry(b, s, events);
  for (const j of b.jeeps)
    if (
      (j.phase === 'driving' || j.phase === 'unloading') &&
      Math.hypot(j.x - x, j.z - z) <= radius + 1
    ) {
      j.health -= 12;
      if (j.health <= 0) stopJeep(b, j, events);
    }
}

export function updatePlayerWeapons(
  b: PillboxBattle,
  dt: number,
  events: PillboxEvent[],
) {
  b.grenadeCooldown = Math.max(0, b.grenadeCooldown - dt);
  for (const g of b.playerGrenades) {
    g.age += dt;
    if (g.age >= PLAYER_GRENADE_FLIGHT) {
      areaDamage(b, g.x, g.z, 7, events);
      events.push({ type: 'player-blast', x: g.x, z: g.z });
    }
  }
  b.playerGrenades = b.playerGrenades.filter(
    (g) => g.age < PLAYER_GRENADE_FLIGHT,
  );
  const strike = b.airStrike;
  if (strike) {
    strike.age += dt;
    while (strike.passes < 13 && strike.age >= 2 + strike.passes * 0.13) {
      const x = strike.x - 24 + strike.passes * 4;
      areaDamage(b, x, strike.z, 5.5, events);
      events.push({ type: 'player-blast', x, z: strike.z });
      strike.passes++;
    }
    if (strike.age >= 5) b.airStrike = null;
  }
}

export function updateSupportReward(b: PillboxBattle, events: PillboxEvent[]) {
  const credit = b.kills + b.vehiclesStopped * 4;
  if (!b.airSupportCharges) {
    b.supportProgress += Math.max(0, credit - b.supportCredit);
    if (b.supportProgress >= SUPPORT_REQUIRED) {
      b.supportProgress = 0;
      b.airSupportCharges = 1;
      events.push({ type: 'support-ready' });
      b.message = 'Strafing run earned! Aim and press V to call support.';
    }
  }
  b.supportCredit = credit;
}

export function chooseSupplies(
  b: PillboxBattle,
  choice: SupplyChoice,
): boolean {
  if (
    b.status !== 'resupply' ||
    !['repair', 'barrel', 'grenades'].includes(choice)
  )
    return false;
  if (choice === 'repair') b.health = Math.min(100, b.health + 35);
  if (choice === 'barrel') b.barrelLevel = Math.min(2, b.barrelLevel + 1);
  b.grenadeAmmo = choice === 'grenades' ? 5 : 3;
  b.heat = 0;
  b.overheated = false;
  b.cooldown = 0;
  b.grenadeCooldown = 0;
  b.wave++;
  b.spawned = 0;
  b.spawnTimer = 0;
  b.intermission = 0;
  b.landingCraft = createLandingCraft(b.wave);
  b.pendingInfantry = Array.from({ length: WAVE_COUNTS[b.wave - 1] }, (_, i) =>
    nextInfantryId(b.wave, i),
  );
  b.jeepSpawned = 0;
  b.jeepTimer = 5;
  b.status = 'playing';
  b.message = `Wave ${b.wave}. New landing craft approaching.`;
  return true;
}
