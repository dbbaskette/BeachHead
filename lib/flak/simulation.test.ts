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
  eyePosition,
  GRAVITY,
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
      // Solve interception for aircraft moving toward us, including vertical
      // motion and the gun's existing 600 m ballistic zero.
      const eye = eyePosition(s);
      let t = Math.hypot(p.x - eye.x, p.y - EYE.y, p.z - eye.z) / SPEED;
      for (let n = 0; n < 6; n++)
        t =
          Math.hypot(
            p.x + p.vx * t - eye.x,
            p.y + p.vy * t - EYE.y,
            p.z + p.vz * t - eye.z,
          ) / SPEED;
      const x = p.x + p.vx * t - eye.x,
        z = p.z + p.vz * t - eye.z;
      const y = p.y + p.vy * t - EYE.y + 0.5 * GRAVITY * t * (t - 600 / SPEED);
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
void test('every aircraft type approaches from the same offshore bearing', () => {
  const s = active();
  RAIDS.forEach((_, i) => spawnAircraft(s, i));
  assert.deepEqual(
    new Set(s.planes.map((p) => p.kind)),
    new Set(['transport', 'bomber', 'fighter']),
  );
  for (const p of s.planes) {
    assert.ok(p.x < 0 && p.z < 0 && p.vx > 0 && p.vz > 0);
    assert.equal(p.vz / p.vx, 0.6875);
    if (p.kind !== 'transport')
      assert.ok(Math.abs(p.z - p.x * 0.6875 - 4) < 1e-8);
  }
});
void test('fighters strafe the battery with bounded ballistic rounds and climb away', () => {
  const s = active();
  s.next = RAIDS.length;
  spawnAircraft(s, 3);
  const p = s.planes[0];
  let shots = 0,
    strikes = 0,
    maxRounds = 0,
    minHeight = p.y;
  for (let i = 0; i < 9 * 60; i++) {
    stepFlak(s, 1 / 60);
    shots += s.events.filter((e) => e.kind === 'strafe').length;
    strikes += s.events.filter((e) => e.kind === 'strike').length;
    maxRounds = Math.max(maxRounds, s.enemyRounds.length);
    minHeight = Math.min(minHeight, p.y);
  }
  assert.equal(shots, 12);
  assert.equal(strikes, 12);
  assert.ok(maxRounds <= 8);
  assert.ok(s.integrity < 100 && s.integrity >= 70);
  assert.ok(minHeight < 100 && p.y > 108 && p.vy > 0);
  assert.equal(s.enemyRounds.length, 0);
});
void test('downing a strafing fighter stops future shots while released rounds still land', () => {
  const s = active();
  s.next = RAIDS.length;
  spawnAircraft(s, 3);
  while (!s.enemyRounds.length) stepFlak(s, 1 / 60);
  const p = s.planes[0],
    payload = p.payload;
  p.health = 0;
  let impacts = 0;
  for (let i = 0; i < 120; i++) {
    stepFlak(s, 1 / 60);
    assert.ok(!s.events.some((e) => e.kind === 'strafe'));
    impacts += s.events.filter((e) => e.kind === 'strike').length;
  }
  assert.equal(p.payload, payload);
  assert.ok(impacts > 0);
});
void test('pending hostile fire prevents victory and pauses with the rest of the simulation', () => {
  const s = active();
  s.next = RAIDS.length;
  s.enemyRounds.push({
    id: 1,
    x: 0,
    y: 10,
    z: 4,
    vx: 0,
    vy: -20,
    vz: 0,
    age: 0,
  });
  stepFlak(s, 0.1);
  assert.equal(s.status, 'playing');
  s.status = 'paused';
  const before = structuredClone(s.enemyRounds);
  stepFlak(s, 0.1);
  assert.deepEqual(s.enemyRounds, before);
  s.status = 'playing';
  advance(s, 1);
  assert.equal(s.status, 'won');
  assert.equal(s.integrity, 97.5);
});
void test('the complete unattended raid schedule fits the aircraft and tracer render pools', () => {
  const s = active();
  for (let i = 0; i < 150 * 60 && s.status === 'playing'; i++) {
    // Isolate pool capacity from battery defeat; do not skip any wave or attack.
    s.integrity = 100;
    stepFlak(s, 1 / 60);
    for (const kind of ['transport', 'bomber', 'fighter'])
      assert.ok(s.planes.filter((p) => p.kind === kind).length <= 3, kind);
    assert.ok(s.enemyRounds.length <= 24);
  }
  assert.equal(s.next, RAIDS.length);
  assert.equal(s.status, 'won');
});
