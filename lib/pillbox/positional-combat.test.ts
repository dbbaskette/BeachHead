import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createPillboxBattle, stepPillbox, aimPillbox } from './simulation';
import {
  throwPlayerGrenade,
  callAirSupport,
  chooseSupplies,
} from './combat-actions';
import { updateInfantryTactics, updateFoxhole } from './squad-tactics';
import { FOXHOLES } from './foxholes';
import { terrainRelief, terrainBlocksShot } from './terrain';
import { TacticalRenderer } from './tactical-renderer';
import type { Infantry, PillboxBattle, PillboxEvent } from './types';

function isolated() {
  const b = createPillboxBattle();
  b.status = 'playing';
  b.spawnTimer = 1000;
  b.jeepSpawned = 1;
  b.landingCraft.forEach((c) => (c.gunnerHealth = 0));
  return b;
}
function troop(id = 3): Infantry {
  return {
    id,
    x: 0,
    z: -40,
    lane: 2,
    health: 2,
    phase: 'advance',
    timer: 0,
    coverIndex: 2,
    waypoint: 99,
    offset: 0,
    speed: 3.5,
    grenadeState: 'spent',
    grenadeTimer: 0,
  };
}
function advance(b: PillboxBattle, time: number, fire = false) {
  for (let t = 0; t < time; t += 0.025)
    stepPillbox(b, Math.min(0.025, time - t), fire);
}

void test('player grenades consume ammunition once, respect cooldown/range/pause, and blast concealed infantry', () => {
  const b = isolated(),
    s = troop();
  Object.assign(s, {
    x: FOXHOLES[2].x,
    z: FOXHOLES[2].z,
    phase: 'cover',
    foxholeId: 2,
    timer: 12,
    suppression: 1,
  });
  b.soldiers = [s];
  aimPillbox(b, 0, -180);
  assert.equal(throwPlayerGrenade(b), false);
  assert.equal(b.grenadeAmmo, 3);
  aimPillbox(b, s.x, s.z);
  assert.ok(throwPlayerGrenade(b));
  assert.equal(b.grenadeAmmo, 2);
  assert.equal(throwPlayerGrenade(b), false);
  b.status = 'paused';
  const before = structuredClone(b);
  stepPillbox(b, 8, false);
  assert.deepEqual(b, before);
  assert.equal(throwPlayerGrenade(b), false);
  b.status = 'playing';
  advance(b, 1.5);
  assert.equal(s.phase, 'down');
  assert.equal(b.kills, 1);
  assert.equal(b.playerGrenades.length, 0);
  b.grenadeAmmo = 0;
  assert.equal(throwPlayerGrenade(b), false);
});

void test('foxhole occupants stay for multiple peek cycles, duck when suppressed, and cannot be pinned forever', () => {
  const b = isolated(),
    s = troop(9),
    events: PillboxEvent[] = [];
  Object.assign(s, {
    phase: 'cover',
    foxholeId: 2,
    timer: 12,
    coverElapsed: 0,
    attackTimer: 0,
  });
  let peeks = 0,
    hidden = 0;
  for (let i = 0; i < 400; i++) {
    s.suppression = 0;
    updateFoxhole(b, s, 0.025, events);
    if (s.exposed) peeks++;
    else hidden++;
    s.timer -= 0.025;
  }
  assert.ok(peeks > 50 && hidden > 150);
  assert.ok(s.timer > 1.9);
  s.suppression = 1;
  updateFoxhole(b, s, 0.025, events);
  assert.equal(s.exposed, false);
  s.coverElapsed = 15;
  updateFoxhole(b, s, 0.025, events);
  assert.ok(s.timer <= 0.025);
  assert.ok(events.some((e) => e.type === 'enemy-fire'));
});

void test('a departing foxhole squad does not pull newly arrived occupants straight through', () => {
  const b = isolated(),
    leader = troop(9),
    newcomer = troop(3);
  for (const s of [leader, newcomer])
    Object.assign(s, {
      x: FOXHOLES[2].x,
      z: FOXHOLES[2].z,
      phase: 'cover',
      foxholeId: 2,
      usesFoxhole: true,
    });
  Object.assign(leader, { timer: 0.01, coverElapsed: 12 });
  Object.assign(newcomer, { timer: 11, coverElapsed: 1 });
  b.soldiers = [leader, newcomer];
  stepPillbox(b, 0.025, false);
  assert.equal(leader.foxholeId, undefined);
  assert.equal(newcomer.foxholeId, 2);
  assert.equal(newcomer.phase, 'cover');
  assert.ok(newcomer.timer > 10);
});

void test('MG and mortar crews telegraph setup; killing a crew prevents further fire', () => {
  for (const role of ['machine-gun', 'mortar'] as const) {
    const b = isolated(),
      s = troop(6);
    Object.assign(s, { role, z: role === 'mortar' ? -110 : -90 });
    b.soldiers = [s];
    const events: PillboxEvent[] = [];
    assert.ok(updateInfantryTactics(b, s, 0.1, events));
    assert.equal(s.emplacement, 'setting-up');
    assert.equal(b.health, 100);
    for (let t = 0; t < 8; t += 0.025)
      updateInfantryTactics(b, s, 0.025, events);
    assert.equal(s.emplacement, 'firing');
    if (role === 'mortar') assert.equal(b.grenades[0]?.kind, 'mortar');
    else assert.equal(b.health, 97);
    s.phase = 'down';
    const health = b.health,
      n = b.grenades.length;
    updateInfantryTactics(b, s, 20, events);
    assert.equal(b.health, health);
    assert.equal(b.grenades.length, n);
  }
});

void test('squad members alternate covering fire and movement and rush together after a rally', () => {
  const b = isolated(),
    a = troop(2),
    c = troop(3);
  Object.assign(a, { x: 0, z: -100, squadId: 12 });
  Object.assign(c, { x: 1, z: -101, squadId: 12 });
  b.soldiers = [a, c];
  const events: PillboxEvent[] = [];
  b.time = 0;
  assert.notEqual(
    updateInfantryTactics(b, a, 0.01, events),
    updateInfantryTactics(b, c, 0.01, events),
  );
  b.time = 3;
  assert.equal(updateInfantryTactics(b, a, 0.01, events), false);
  assert.equal(updateInfantryTactics(b, c, 0.01, events), true);
  a.rallyUntil = 5;
  a.rushUntil = 10;
  b.time = 4;
  assert.equal(updateInfantryTactics(b, a, 0.01, events), true);
  b.time = 6;
  assert.equal(updateInfantryTactics(b, a, 0.01, events), false);
});

void test('damaged ramps delay their craft but other boats unload; all passengers eventually land', () => {
  const b = isolated();
  b.spawnTimer = 0;
  const c = b.landingCraft[3];
  c.z = -140;
  c.phase = 'lowering';
  aimPillbox(b, c.x, c.z + 6);
  for (let i = 0; i < 8; i++) {
    b.cooldown = 0;
    stepPillbox(b, 0.001, true);
  }
  assert.equal(c.rampHealth, 0);
  assert.ok(c.jamTimer > 6.9);
  assert.equal(c.passengers, c.capacity);
  const other = b.landingCraft[0];
  other.z = -140;
  other.ramp = 1;
  other.phase = 'unloading';
  advance(b, 0.3);
  assert.ok(other.passengers < other.capacity);
  assert.equal(c.passengers, c.capacity);
  advance(b, 25);
  assert.equal(b.spawned, 18);
  assert.ok(b.landingCraft.every((c) => c.passengers === 0));
});

void test('shooting the exposed craft gunner stops its covering fire', () => {
  const b = isolated(),
    c = b.landingCraft[2];
  c.z = -140;
  c.phase = 'unloading';
  c.ramp = 1;
  c.gunnerHealth = 2;
  c.attackTimer = 0.2;
  aimPillbox(b, c.x - 1.3, c.z - 4.5);
  for (let i = 0; i < 2; i++) {
    b.cooldown = 0;
    stepPillbox(b, 0.001, true);
  }
  assert.equal(c.gunnerHealth, 0);
  advance(b, 5);
  assert.equal(b.health, 100);
});

void test('wave choice freezes combat, grants exactly one benefit, and starts a fresh wave', () => {
  for (const choice of ['repair', 'barrel', 'grenades'] as const) {
    const b = isolated();
    b.spawned = 18;
    b.health = 40;
    b.grenadeAmmo = 0;
    stepPillbox(b, 0.1, false);
    assert.equal(b.status, 'resupply');
    const before = structuredClone(b);
    stepPillbox(b, 10, true);
    assert.deepEqual(b, before);
    assert.ok(chooseSupplies(b, choice));
    assert.equal(b.wave, 2);
    assert.equal(b.status, 'playing');
    assert.equal(b.pendingInfantry.length, 24);
    assert.equal(b.health, choice === 'repair' ? 75 : 40);
    assert.equal(b.barrelLevel, choice === 'barrel' ? 1 : 0);
    assert.equal(b.grenadeAmmo, choice === 'grenades' ? 5 : 3);
    assert.equal(chooseSupplies(b, choice), false);
    assert.equal(b.wave, 2);
  }
});

void test('earned strafing pass spends a charge, clears a line of cover, and ends cleanly', () => {
  const b = isolated();
  b.kills = 12;
  stepPillbox(b, 0.01, false);
  assert.equal(b.airSupportCharges, 1);
  assert.equal(b.supportProgress, 0);
  const s = troop();
  Object.assign(s, { phase: 'cover', x: 0, z: -65, timer: 20 });
  b.soldiers = [s];
  aimPillbox(b, 0, -65);
  assert.ok(callAirSupport(b));
  assert.equal(callAirSupport(b), false);
  assert.equal(b.airSupportCharges, 0);
  advance(b, 3.8);
  assert.equal(s.phase, 'down');
  assert.equal(b.kills, 13);
  advance(b, 2);
  assert.equal(b.airStrike, null);
});

void test('terrain has meaningful relief and occludes low targets without blocking every lane', () => {
  assert.ok(terrainRelief(-30, -91) > 2);
  assert.ok(terrainRelief(29, -78) > 2);
  let blocked = 0,
    clear = 0;
  for (const x of [-36, -18, 0, 18, 36])
    for (let z = -125; z < -25; z += 5)
      if (terrainBlocksShot(x, z, 0.55)) blocked++;
      else clear++;
  assert.ok(blocked > 0 && clear > blocked);
});

void test('tactical models reuse resources and dispose when the stage exits', () => {
  const scene = new THREE.Scene(),
    renderer = new TacticalRenderer(scene),
    b = isolated();
  const s = troop();
  s.role = 'mortar';
  s.emplacement = 'setting-up';
  s.setupTimer = 3;
  b.soldiers = [s];
  b.playerGrenades = [{ id: 1, x: 0, z: -60, age: 0.5 }];
  b.airStrike = { x: 0, z: -70, age: 2.5, passes: 3 };
  renderer.render(b);
  assert.ok(scene.getObjectByName('mortar-position-3'));
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      resources.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        resources.add(m);
    }
  });
  let disposed = 0;
  resources.forEach((r) => r.addEventListener('dispose', () => disposed++));
  renderer.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, resources.size);
});
