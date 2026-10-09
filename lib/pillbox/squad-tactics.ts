import { terrainBlocksShot } from './terrain';
import { type Infantry, type PillboxBattle, type PillboxEvent } from './types';

export function damagePosition(
  b: PillboxBattle,
  amount: number,
  events: PillboxEvent[],
) {
  b.health = Math.max(0, b.health - amount);
  if (!b.health && b.status === 'playing') {
    b.status = 'lost';
    b.message = 'The pillbox has fallen.';
    events.push({ type: 'lost' });
  }
}

export function rallySquad(b: PillboxBattle, s: Infantry, delay = 1.8) {
  for (const ally of b.soldiers)
    if (
      ally.phase !== 'down' &&
      ally.phase !== 'breached' &&
      ((s.squadId !== undefined && ally.squadId === s.squadId) ||
        Math.hypot(ally.x - s.x, ally.z - s.z) < 10)
    ) {
      ally.rallyUntil = b.time + delay;
      ally.rushUntil = b.time + delay + 5;
    }
}

/** Returns true while a squad member holds off advancing along its route. */
export function updateInfantryTactics(
  b: PillboxBattle,
  s: Infantry,
  dt: number,
  events: PillboxEvent[],
  masked = terrainBlocksShot,
): boolean {
  s.suppression = Math.max(0, (s.suppression ?? 0) - dt);
  s.attackTimer = Math.max(0, (s.attackTimer ?? 3) - dt);
  s.supporting = false;
  if (s.phase !== 'advance' || s.landingCraftId !== undefined) return false;
  if (
    s.role &&
    s.role !== 'rifle' &&
    s.z > (s.role === 'mortar' ? -116 : -96)
  ) {
    if (!s.emplacement && masked(s.x, s.z, 1.4)) {
      // Crews need a line of fire, so the pillbox can always hit back: sidestep
      // toward open mid-beach and, finding none, press on as riflemen.
      const step = Math.min(Math.abs(s.x), s.speed * dt);
      s.x -= Math.sign(s.x) * step;
      if (!step) s.role = 'rifle';
      return step > 0;
    }
    if (!s.emplacement) {
      s.emplacement = 'setting-up';
      s.setupTimer = s.role === 'mortar' ? 7 : 4.5;
      b.message =
        s.role === 'mortar'
          ? 'Mortar team deploying near the surf!'
          : 'Machine-gun team setting up!';
    }
    if (s.emplacement === 'setting-up') {
      s.setupTimer = Math.max(0, (s.setupTimer ?? 0) - dt);
      if (!s.setupTimer) {
        s.emplacement = 'firing';
        s.attackTimer = 0.5;
      }
    } else if (!s.attackTimer && !s.suppression) {
      if (s.role === 'mortar') {
        b.grenades.push({
          id: b.nextProjectileId++,
          x: s.x,
          z: s.z,
          age: 0,
          kind: 'mortar',
        });
        events.push({ type: 'mortar-launch', x: s.x, z: s.z });
        s.attackTimer = 8;
        b.message = 'Mortar incoming! Silence the crew.';
      } else {
        events.push({ type: 'enemy-fire', x: s.x, z: s.z, heavy: true });
        damagePosition(b, 3, events);
        s.attackTimer = 5;
      }
    }
    return true;
  }
  if ((s.rallyUntil ?? 0) > b.time) return true;
  if (
    (s.rushUntil ?? 0) > b.time ||
    s.z < -111 ||
    s.z > -43 ||
    s.grenadeState === 'windup' ||
    s.smokeState === 'windup'
  )
    return false;
  const allies = b.soldiers.filter(
    (a) =>
      a.id !== s.id &&
      a.squadId === s.squadId &&
      a.phase === 'advance' &&
      Math.hypot(a.x - s.x, a.z - s.z) < 20,
  );
  if (
    s.squadId !== undefined &&
    allies.length &&
    Math.floor((b.time + (s.squadId % 3)) / 3) % 2 === s.id % 2
  ) {
    s.supporting = true;
    if (!s.attackTimer && !s.suppression && !terrainBlocksShot(s.x, s.z, 1.4)) {
      events.push({ type: 'enemy-fire', x: s.x, z: s.z });
      s.attackTimer = 5.5;
      // Suppressive fire is visible; a fraction of volleys chip bunker integrity.
      if (s.id % 3 === 1) damagePosition(b, 1, events);
    }
    return true;
  }
  return false;
}

export function updateFoxhole(
  b: PillboxBattle,
  s: Infantry,
  dt: number,
  events: PillboxEvent[],
) {
  s.coverElapsed = (s.coverElapsed ?? 0) + dt;
  s.exposed = !s.suppression && (s.coverElapsed + s.id * 0.27) % 3.6 < 1.05;
  if (s.exposed && !s.attackTimer) {
    events.push({ type: 'enemy-fire', x: s.x, z: s.z });
    damagePosition(b, 1, events);
    s.attackTimer = 4.5;
  }
  if (s.coverElapsed > 5 && s.id % 2 === 0 && s.grenadeState !== 'spent') {
    if (s.suppression) {
      s.grenadeState = 'ready';
      s.grenadeTimer = 0;
    } else {
      s.grenadeState = 'windup';
      s.exposed = true;
      s.grenadeTimer += dt;
      if (s.grenadeTimer >= 1.4) {
        s.grenadeState = 'spent';
        b.grenades.push({ id: s.id, x: s.x, z: s.z, age: 0 });
        b.message = 'Grenade from a foxhole!';
      }
    }
  }
  if (s.suppression && s.coverElapsed < 15) s.timer = Math.max(s.timer, 0.7);
  if (s.coverElapsed >= 15) s.timer = Math.min(s.timer, dt);
}
