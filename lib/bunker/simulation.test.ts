import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canStand,
  createBunker,
  emptyInput,
  moveBody,
  reloadBunker,
  shootBunker,
  sightLine,
  stepBunker,
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
  assert.ok(g.windup > 0);
  assert.equal(b.health, 100);
  b.x = 2;
  for (let i = 0; i < 14; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.health, 100);
  g.cooldown = 0;
  stepBunker(b, emptyInput(), 0.05);
  for (let i = 0; i < 14; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.health, 92);
});
void test('pause freezes timers and movement; exit only completes after clearing all guards', () => {
  const b = active();
  b.status = 'paused';
  b.reload = 1;
  const previous = structuredClone(b);
  stepBunker(b, { ...emptyInput(), forward: 1, fire: true }, 0.05);
  assert.deepEqual(b, previous);
  b.status = 'playing';
  b.x = 0;
  b.z = -23;
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.status, 'playing');
  b.guards.forEach((g) => (g.health = 0));
  stepBunker(b, emptyInput(), 0.05);
  assert.equal(b.status, 'won');
  assert.equal(createBunker().guards.length, 4);
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

void test('sample can be completed through movement and gunfire without bypassing walls or guard damage', () => {
  const b = active();
  b.ammo = 2;
  const route = [
    [0, 4],
    [0, -9],
    [0, -13],
    [0, -21],
    [0, -23],
  ];
  let waypoint = 0;
  for (let frame = 0; frame < 5000 && b.status === 'playing'; frame++) {
    const target = b.guards.find(
      (g) =>
        g.health > 0 &&
        Math.hypot(g.x - b.x, g.z - b.z) < 18 &&
        sightLine(b.x, b.z, g.x, g.z),
    );
    const input = emptyInput();
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
  assert.equal(b.status, 'won');
  assert.ok(b.guards.every((g) => g.health <= 0));
  assert.ok(b.reserve < 128, 'automatic reload used reserve ammunition');
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
  for (let i = 0; i < 30; i++) stepBunker(b, emptyInput(), 0.05);
  assert.equal(g.down, 1);
  assert.equal(g.flash, 0);
  assert.equal(
    b.effects.filter((e) => e.kind === 'enemy' && e.x === g.x && e.z === g.z)
      .length,
    0,
  );
});
