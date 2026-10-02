import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canStand,
  rooms,
  guardSpawns,
  chargeSites,
  plantCharge,
  equipCharges,
  nearbyChargeSite,
  finishBunker,
  createBunker,
  emptyInput,
  moveBody,
  reloadBunker,
  shootBunker,
  sightLine,
  stepBunker,
  angleDifference,
  prepareDeath,
  openDoor,
  nearbyDoor,
  worldSolids,
  throwGrenade,
  explodeGrenade,
} from './simulation';
const active = () => {
  const b = createBunker();
  b.status = 'playing';
  return b;
};
void test('connected rooms can be traversed but walls, gun and crates block movement', () => {
  for (const z of [12, 3, 2, 0, -9, -10, -15, -22])
    assert.ok(canStand(0, z), `route at ${z}`);
  const body = { x: 0, z: 10 };
  moveBody(body, 30, 0);
  assert.ok(body.x < 6.5);
  const gun = { x: -2, z: 8.5 };
  moveBody(gun, -4, 0);
  assert.ok(gun.x > -2.6);
  assert.equal(canStand(3, -4), false);
});
void test('gunfire hits the nearest visible guard, consumes rounds, respects reload and cover', () => {
  const b = active();
  b.guards[0].x = 0;
  b.guards[0].z = 5;
  shootBunker(b);
  assert.equal(b.ammo, 31);
  assert.equal(b.guards[0].health, 25);
  shootBunker(b);
  assert.equal(b.ammo, 31);
  b.cooldown = 0;
  shootBunker(b);
  assert.ok(b.guards[0].health <= 0);
  const hidden = active();
  hidden.x = 4;
  hidden.z = 5;
  hidden.guards[0].x = 4;
  hidden.guards[0].z = -3;
  shootBunker(hidden);
  assert.equal(hidden.guards[0].health, 100);
  reloadBunker(hidden);
  const before = hidden.ammo;
  hidden.cooldown = 0;
  shootBunker(hidden);
  assert.equal(hidden.ammo, before);
});
void test('reload conserves ammunition and empty magazines reload automatically', () => {
  const b = active();
  b.guards = [];
  b.ammo = 0;
  b.reserve = 12;
  shootBunker(b);
  assert.ok(b.reload > 0);
  for (let i = 0; i < 40; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.ammo, 12);
  assert.equal(b.reserve, 0);
});
void test('guards cannot see through a wall, telegraph shots, and allow movement to dodge', () => {
  assert.equal(sightLine(4, 5, 4, -3), false);
  const b = active();
  b.guards = b.guards.slice(0, 1);
  const g = b.guards[0];
  g.x = 0;
  g.z = 6;
  g.cooldown = 0;
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(g.mode, 'notice');
  assert.equal(
    g.windup,
    0,
    'recognition and weapon raising happen before firing',
  );
  assert.equal(b.health, 100);
  for (let i = 0; i < 70 && g.windup === 0; i++)
    stepBunker(b, emptyInput(), 0.05);
  assert.ok(g.windup > 0);
  b.x = 2;
  for (let i = 0; i < 14; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.health, 100);
  g.cooldown = 0;
  for (let i = 0; i < 70 && g.windup === 0; i++)
    stepBunker(b, emptyInput(), 0.05);
  for (let i = 0; i < 14; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.health, 92);
});
void test('pause freezes timers and movement; clearing guards alone never completes the mission', () => {
  const b = active();
  b.status = 'paused';
  b.reload = 1;
  const previous = structuredClone(b);
  stepBunker(b, { ...emptyInput(), forward: 1, fire: true }, 0.05);
  assert.deepEqual(b, previous);
  b.status = 'playing';
  b.x = 0;
  b.z = -41;
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.status, 'playing');
  b.guards.forEach((g) => (g.health = 0));
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.status, 'playing');
  assert.equal(createBunker().guards.length, 12);
  assert.equal(createBunker().status, 'ready');
});
void test('medical kit is consumed once, health cannot exceed 100, and zero health loses', () => {
  const b = active();
  b.guards = [];
  b.x = -4.8;
  b.z = -12;
  b.health = 80;
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.health, 100);
  assert.equal(b.medkit, false);
  b.health = 70;
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.health, 70);
  b.health = 0;
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.status, 'lost');
});

void test('radio mission can be completed through combat, doors, planting and escape without bypassing collision', () => {
  const b = active();
  b.ammo = 2;
  const route = [
    [0, 4],
    [0, -9],
    [0, -13],
    [0, -21],
    [0, -25],
    [0, -30],
    [0, -34],
    [0, -41],
    [0, -44],
    [0, -48],
    [-2, -52.6],
    [2, -52.6],
    [0, -49],
    [0, -40],
    [0, -34],
    [9.5, -34],
    [19, -34],
    [19, -25],
    [19, -17],
    [10, -17],
    [0, -17],
    [0, -8],
    [0, 4],
    [0, 14.5],
  ];
  let waypoint = 0;
  for (let frame = 0; frame < 7000 && b.status === 'playing'; frame++) {
    openDoor(b);
    const target = b.guards.find(
      (g) =>
        g.health > 0 &&
        Math.hypot(g.x - b.x, g.z - b.z) < 18 &&
        sightLine(b.x, b.z, g.x, g.z, worldSolids(b)),
    );
    const input = emptyInput();
    if (b.planting !== null) {
      stepBunker(b, input, 1 / 60);
      continue;
    }
    if (nearbyChargeSite(b) >= 0) {
      plantCharge(b);
      continue;
    }
    if (b.weapon === 'charge') equipCharges(b);
    if (target) {
      b.yaw = Math.atan2(b.x - target.x, b.z - target.z);
      b.pitch = 0;
      input.fire = true;
    } else {
      const [x, z] = route[waypoint];
      if (Math.hypot(x - b.x, z - b.z) < 0.2 && waypoint < route.length - 1)
        waypoint++;
      b.yaw = Math.atan2(b.x - route[waypoint][0], b.z - route[waypoint][1]);
      b.pitch = 0;
      input.forward = 1;
    }
    stepBunker(b, input, 1 / 60);
    b.effects.splice(0);
  }
  assert.equal(
    b.status,
    'cinematic',
    `position ${b.x}, ${b.z}; waypoint ${waypoint}`,
  );
  assert.deepEqual(b.charges, [true, true]);
  finishBunker(b);
  assert.equal(b.status, 'won');
  assert.ok(
    b.reserve < 192 + b.supplies.filter((s) => !s).length * 64,
    'automatic reload used reserve ammunition',
  );
  assert.ok(b.health > 0);
});

void test('wounds carry their actual point and direction, interrupt firing and briefly stagger a living guard', () => {
  const b = active(),
    g = b.guards[0];
  g.x = 0;
  g.z = 6;
  g.windup = 0.1;
  b.pitch = Math.atan2(1.05 - 1.65, b.z - g.z);
  shootBunker(b);
  assert.equal(g.hitRegion, 'torso');
  assert.equal(g.health, 66);
  assert.equal(g.windup, 0);
  assert.ok(g.hitTime > 0);
  const hit = b.effects.find((e) => e.kind === 'hit')!;
  assert.equal(hit.guardId, g.id);
  assert.equal(hit.fatal, false);
  assert.ok(hit.y > 0.9 && hit.y < 1.2);
  assert.ok(hit.direction![2] < 0);
  const position = [g.x, g.z];
  stepBunker(b, emptyInput(), 0.05);
  assert.deepEqual([g.x, g.z], position);
  assert.equal(g.flash, 0);
  b.status = 'paused';
  const before = structuredClone(b);
  stepBunker(b, emptyInput(), 0.05);
  assert.deepEqual(b, before);
});
void test('fatal head hits initiate a bounded collapse and dead guards cannot fire', () => {
  const b = active(),
    g = b.guards[0];
  g.x = 0;
  g.z = 6;
  g.health = 50;
  g.windup = 0.01;
  shootBunker(b);
  assert.equal(g.hitRegion, 'head');
  assert.equal(b.effects.find((e) => e.kind === 'hit')?.fatal, true);
  for (let i = 0; i < 40; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(g.down, 1);
  assert.equal(g.flash, 0);
  assert.equal(
    b.effects.filter((e) => e.kind === 'enemy' && e.x === g.x && e.z === g.z)
      .length,
    0,
  );
});

void test('an unaware guard cannot see behind himself, but nearby gunfire makes him turn toward its origin', () => {
  const b = active();
  b.guards = b.guards.slice(0, 1);
  const g = b.guards[0];
  g.x = 0;
  g.z = 5;
  g.yaw = g.homeYaw = 0;
  for (let i = 0; i < 20; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(g.mode, 'idle');
  assert.equal(g.awareness, 0);
  assert.equal(b.health, 100);
  b.yaw = Math.PI / 2;
  shootBunker(b);
  assert.equal(g.mode, 'search');
  const yaw = g.yaw;
  stepBunker(b, emptyInput(), 0.05);
  assert.ok(Math.abs(angleDifference(g.yaw, yaw)) <= 0.106);
  assert.ok(g.headYaw !== 0);
  assert.equal(g.windup, 0);
  for (let i = 0; i < 80; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(g.mode, 'engage');
  assert.ok(g.readiness > 0.9);
});
void test('lost sight cancels shooting and search follows the last known position, not the hidden player', () => {
  const b = active();
  b.guards = b.guards.slice(0, 1);
  const g = b.guards[0];
  g.x = 0;
  g.z = 5;
  g.yaw = Math.PI;
  for (let i = 0; i < 30; i++) stepBunker(b, emptyInput(), 0.05);
  const seen = { x: g.lastX, z: g.lastZ };
  b.x = 4;
  b.z = -4;
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(g.mode, 'search');
  assert.equal(g.windup, 0);
  assert.deepEqual({ x: g.lastX, z: g.lastZ }, seen);
  b.x = -4;
  b.z = -17;
  for (let i = 0; i < 110; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(g.mode, 'idle');
  assert.equal(g.windup, 0);
  assert.ok(g.readiness < 0.4);
});
void test('initial reflex varies across impacts and leg hits favor loss of knee support', () => {
  const g = active().guards[0];
  const actions = new Set<string>();
  for (let t = 0; t < 4; t++) {
    prepareDeath(g, t / 3);
    actions.add(g.deathAction);
  }
  assert.equal(actions.size, 4);
  g.hitRegion = 'leg';
  prepareDeath(g, 0);
  assert.equal(g.deathAction, 'kneel');
});
void test('subsequent bullets hit the falling body at its physical position without restarting death', () => {
  const b = active(),
    g = b.guards[0];
  g.health = 0;
  g.down = 0.45;
  g.deathAction = 'spin';
  g.bodyTargets = [{ x: 0, y: 1.65, z: 6, r: 0.2, region: 'torso' }];
  shootBunker(b);
  assert.equal(g.hits, 1);
  assert.equal(g.down, 0.45);
  assert.equal(g.deathAction, 'spin');
  const hit = b.effects.find((e) => e.kind === 'hit');
  assert.ok(hit);
  assert.equal(hit.guardId, g.id);
  assert.ok(Math.abs(hit.z - 6.2) < 0.001);
  // The obsolete upright location cannot intercept the next round.
  g.bodyTargets = [{ x: 3, y: 0.2, z: 6, r: 0.2, region: 'torso' }];
  b.cooldown = 0;
  b.effects = [];
  shootBunker(b);
  assert.equal(g.hits, 1);
});

void test('steel doors block movement, bullets and sight until opened, and pause freezes them', () => {
  const b = active();
  b.x = 0;
  b.z = -22;
  const g = b.guards[4];
  g.x = 0;
  g.z = -26;
  b.guards = [g];
  assert.ok(nearbyDoor(b));
  assert.equal(sightLine(0, -22, 0, -26, worldSolids(b)), false);
  shootBunker(b);
  assert.equal(g.health, 100);
  moveBody(b, 0, -4, worldSolids(b));
  assert.ok(b.z > -24);
  openDoor(b);
  b.status = 'paused';
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.doors[0].progress, 0);
  b.status = 'playing';
  for (let i = 0; i < 30; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.doors[0].progress, 1);
  assert.equal(sightLine(0, -22, 0, -26, worldSolids(b)), true);
  moveBody(b, 0, -4, worldSolids(b));
  assert.ok(b.z < -24);
  assert.equal(createBunker().doors[0].progress, 0);
});
void test('grenades are limited, bounce off closed doors, pause with the game and detonate once', () => {
  const b = active();
  b.guards = [];
  b.x = 0;
  b.z = -22;
  throwGrenade(b);
  throwGrenade(b);
  assert.equal(b.grenades, 2);
  assert.equal(b.activeGrenades.length, 1);
  b.status = 'paused';
  const before = structuredClone(b);
  throwGrenade(b);
  stepBunker(b, emptyInput(), 0.05);
  assert.deepEqual(b, before);
  b.status = 'playing';
  let bounced = false;
  for (let i = 0; i < 50; i++) {
    stepBunker(b, emptyInput(), 0.05);
    for (const p of b.activeGrenades)
      assert.ok(p.z > -23.84, 'cannot pass through shut door');
    bounced ||= b.effects.some((e) => e.kind === 'bounce');
  }
  assert.ok(bounced);
  assert.equal(b.activeGrenades.length, 0);
  assert.equal(b.effects.filter((e) => e.kind === 'blast').length, 1);
  assert.ok(b.health < 100, 'nearby self blast damages player');
  assert.equal(createBunker().grenades, 3);
  assert.equal(createBunker().activeGrenades.length, 0);
});
void test('blast falloff and cover govern guard damage and physical impulse, including fallen bodies', () => {
  const b = active();
  b.x = 0;
  b.z = -22;
  const g = b.guards[4];
  b.guards = [g];
  g.x = 0;
  g.z = -25;
  explodeGrenade(b, { x: 0, y: 0.2, z: -23 });
  assert.equal(g.health, 100, 'closed steel door shields guard');
  b.doors[0].progress = 1;
  explodeGrenade(b, { x: 0, y: 0.2, z: -24.5 });
  assert.ok(g.health <= 0);
  assert.ok(g.hitPower > 4);
  assert.ok(g.hitLift > 1);
  const hits = g.hits;
  g.down = 0.7;
  g.bodyTargets = [{ x: 0, y: 0.2, z: -25, r: 0.2, region: 'torso' }];
  explodeGrenade(b, { x: 0, y: 0.2, z: -24.5 });
  assert.equal(g.hits, hits + 1);
  assert.equal(g.down, 0.7);
  assert.ok(b.blastShake > 0);
});

void test('every room, guard and supply route belongs to the connected walkable bunker', () => {
  const b = active();
  b.doors.forEach((d) => (d.progress = 1));
  const obstacles = worldSolids(b);
  const visited = new Set<string>();
  const queue = [[0, 12]];
  for (let index = 0; index < queue.length; index++) {
    const [x, z] = queue[index],
      key = `${x},${z}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dz] of [
      [0.5, 0],
      [-0.5, 0],
      [0, 0.5],
      [0, -0.5],
    ]) {
      const nx = x + dx,
        nz = z + dz;
      if (!visited.has(`${nx},${nz}`) && canStand(nx, nz, 0.3, obstacles))
        queue.push([nx, nz]);
    }
  }
  for (const r of rooms)
    assert.ok(
      [...visited].some((key) => {
        const [x, z] = key.split(',').map(Number);
        return (
          Math.abs(x - r.x) < r.w / 2 - 0.5 && Math.abs(z - r.z) < r.d / 2 - 0.5
        );
      }),
      `reachable ${r.name}`,
    );
  for (const [x, z] of guardSpawns)
    assert.ok(canStand(x, z, 0.3, obstacles), `guard at ${x},${z}`);
  for (const site of chargeSites) assert.ok(visited.has(`${site.x},-52.5`));
});
void test('charges require proximity, remain limited and cannot be detonated by gunfire or grenades', () => {
  const b = active();
  b.guards = [];
  plantCharge(b);
  assert.equal(b.planting, null);
  b.x = -2;
  b.z = -52.6;
  plantCharge(b);
  assert.equal(b.planting, 0);
  for (let i = 0; i < 40; i++) stepBunker(b, emptyInput(), 0.05);
  assert.deepEqual(b.charges, [true, false]);
  plantCharge(b);
  assert.equal(b.planting, null);
  explodeGrenade(b, { x: -2, y: 1, z: -54 });
  assert.equal(b.status, 'playing');
  assert.equal(b.mission, 'plant');
  b.health = 100;
  b.x = 2;
  b.z = -52.6;
  plantCharge(b);
  for (let i = 0; i < 40; i++) stepBunker(b, emptyInput(), 0.05);
  assert.deepEqual(b.charges, [true, true]);
  assert.equal(b.mission, 'escape');
  assert.equal(b.weapon, 'mp40');
  b.x = 0;
  b.z = 14.5;
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.status, 'cinematic');
  const before = structuredClone(b);
  stepBunker(b, { ...emptyInput(), fire: true, forward: 1 }, 0.05);
  assert.deepEqual(b, before);
  finishBunker(b);
  assert.equal(b.status, 'won');
  assert.deepEqual(createBunker().charges, [false, false]);
});
void test('planting pauses, cancels when moving or switching weapons, and escape requires both charges', () => {
  const b = active();
  b.guards = [];
  b.x = -2;
  b.z = -52.6;
  plantCharge(b);
  stepBunker(b, emptyInput(), 0.05);
  b.status = 'paused';
  const before = structuredClone(b);
  stepBunker(b, emptyInput(), 0.05);
  assert.deepEqual(b, before);
  b.status = 'playing';
  b.x += 0.5;
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.planting, null);
  assert.equal(b.charges[0], false);
  plantCharge(b);
  equipCharges(b);
  assert.equal(b.planting, null);
  b.x = 0;
  b.z = 14.5;
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.status, 'playing');
  finishBunker(b);
  assert.equal(b.status, 'playing');
});
