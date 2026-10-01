import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFlak,
  stepFlak,
  aimFlak,
  ellipsoidHit,
  spawnAircraft,
  SPEED,
  EYE,
  RAIDS,
} from './simulation';
function active() {
  const s = createFlak();
  s.status = 'playing';
  return s;
}
function advance(s: ReturnType<typeof active>, seconds: number, fire = false) {
  for (let t = 0; t < seconds; t += 1 / 60) stepFlak(s, 1 / 60, fire);
}
void test('swept collision finds a fast round crossing a thin wing, and rejects a near miss', () => {
  assert.equal(
    ellipsoidHit(
      { x: 0, y: 0, z: -30 },
      { x: 0, y: 0, z: 30 },
      { x: 12, y: 1, z: 2 },
    ),
    28 / 60,
  );
  assert.equal(
    ellipsoidHit(
      { x: 0, y: 2, z: -30 },
      { x: 0, y: 2, z: 30 },
      { x: 12, y: 1, z: 2 },
    ),
    null,
  );
});
void test('pause freezes simulation, ammo and pending raid; restart creates clean state', () => {
  const s = active();
  advance(s, 2, true);
  s.status = 'paused';
  const saved = structuredClone(s);
  saved.events = [];
  stepFlak(s, 0.1, true);
  assert.deepEqual(s, saved);
  const fresh = createFlak();
  assert.equal(fresh.fired, 0);
  assert.equal(fresh.planes.length, 0);
  assert.equal(fresh.integrity, 100);
});
void test('magazine changes stop firing then restore ammunition; release stops new rounds', () => {
  const s = active();
  advance(s, 6.1, true);
  assert.equal(s.fired, 80);
  assert.ok(s.reload > 0);
  advance(s, 3.3, false);
  assert.equal(s.magazine, 80);
  assert.equal(s.reload, 0);
  assert.equal(s.fired, 80);
  advance(s, 0.2, true);
  assert.ok(s.fired > 80);
  const fired = s.fired;
  advance(s, 0.5);
  assert.equal(s.fired, fired);
});
void test('unattended transports deploy four descending troops; downing a transport stops later drops', () => {
  const s = active();
  advance(s, 10);
  assert.ok(s.troops.length >= 4);
  assert.ok(s.troops.every((t) => t.vy < 0));
  assert.ok(s.troops[0].y < 140);
  const blocked = active();
  blocked.next = RAIDS.length;
  spawnAircraft(blocked, 0);
  stepFlak(blocked, 0.01);
  blocked.planes[0].health = 0;
  advance(blocked, 8);
  assert.equal(blocked.troops.length, 0);
});
void test('bombs inherit aircraft velocity, fall under gravity and damage the defended position', () => {
  const s = active();
  s.next = RAIDS.length;
  spawnAircraft(s, 2);
  advance(s, 6.3);
  assert.equal(s.bombs.length, 1);
  const b = s.bombs[0],
    oldY = b.y,
    oldVy = b.vy;
  advance(s, 0.5);
  assert.ok(b.y < oldY);
  assert.ok(b.vy < oldVy);
  assert.equal(b.vx, s.planes[0].vx);
  advance(s, 7);
  assert.ok(s.integrity < 85);
});
void test('unattended full mission loses with bounded entities', () => {
  const s = active();
  let maxRounds = 0,
    maxPlanes = 0,
    maxTroops = 0;
  for (let i = 0; i < 180 * 60 && s.status === 'playing'; i++) {
    stepFlak(s, 1 / 60, true);
    maxRounds = Math.max(maxRounds, s.rounds.length);
    maxPlanes = Math.max(maxPlanes, s.planes.length);
    maxTroops = Math.max(maxTroops, s.troops.length);
  }
  assert.equal(s.status, 'lost');
  assert.ok(maxRounds <= 32);
  assert.ok(maxPlanes <= 6);
  assert.ok(maxTroops <= 20);
});
void test('leading aircraft with ballistic shots can win all three raids without direct damage cheats', () => {
  const s = active();
  for (let i = 0; i < 180 * 60 && s.status === 'playing'; i++) {
    const p = s.planes.find((p) => p.health > 0);
    if (p) {
      const t = Math.hypot(p.x - EYE.x, p.y - EYE.y, p.z - EYE.z) / SPEED;
      const x = p.x + p.vx * t - EYE.x,
        z = p.z + p.vz * t - EYE.z,
        y = p.y - EYE.y;
      s.yaw = Math.atan2(x, -z);
      s.pitch = Math.atan2(y, Math.hypot(x, z));
    }
    stepFlak(s, 1 / 60, !!p);
  }
  assert.equal(s.status, 'won');
  assert.equal(s.downed, RAIDS.length);
  assert.ok(s.integrity >= 90);
  assert.ok(s.fired > 55);
  assert.ok(s.time > 92 && s.time < 135);
});
void test('aim wraps smoothly around the horizon and cannot invert over the zenith', () => {
  const s = active();
  aimFlak(s, Math.PI * 12, 9);
  assert.ok(Math.abs(s.yaw) < Math.PI);
  assert.equal(s.pitch, 1.43);
  aimFlak(s, 0, -10);
  assert.equal(s.pitch, 0.04);
});
