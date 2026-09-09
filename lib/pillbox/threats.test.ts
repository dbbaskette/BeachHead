import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPillboxBattle,
  stepPillbox,
  aimPillbox,
  jeepRoute,
} from './simulation';
import { BEACH_OBSTACLES, clearSegment } from './navigation';
function battle() {
  const b = createPillboxBattle();
  b.status = 'playing';
  b.spawnTimer = 1000;
  return b;
}
function advance(b: ReturnType<typeof battle>, seconds: number, fire = false) {
  for (let t = 0; t < seconds && b.status === 'playing'; t += 0.01)
    stepPillbox(b, 0.01, fire);
}
void test('jeeps withstand 17 hits and the eighteenth denies their passengers', () => {
  const b = battle();
  b.jeepTimer = 0;
  stepPillbox(b, 0.01, false);
  const j = b.jeeps[0];
  for (let i = 0; i < 17; i++) {
    b.cooldown = 0;
    aimPillbox(b, j.x, j.z);
    stepPillbox(b, 0.001, true);
  }
  assert.equal(j.health, 1);
  assert.equal(j.passengers, 4);
  b.cooldown = 0;
  aimPillbox(b, j.x, j.z);
  const events = stepPillbox(b, 0.001, true);
  assert.equal(j.phase, 'wreck');
  assert.equal(j.passengers, 0);
  assert.equal(b.vehiclesStopped, 1);
  assert.ok(events.some((e) => e.type === 'jeep-destroyed'));
  advance(b, 20);
  assert.equal(b.soldiers.length, 0);
});
void test('transport routes avoid obstacles and unload exactly four close infantry', () => {
  for (const side of [-1, 1]) {
    let from = { x: side * 10, z: -132 };
    for (const point of jeepRoute(side)) {
      assert.ok(clearSegment(from, point));
      from = point;
    }
  }
  const b = battle();
  b.jeepTimer = 0;
  for (let t = 0; t < 19; t += 0.01) {
    stepPillbox(b, 0.01, false);
    for (const j of b.jeeps)
      for (const o of BEACH_OBSTACLES)
        assert.ok(
          Math.abs(j.x - o.x) > o.halfX + 1 ||
            Math.abs(j.z - o.z) > o.halfZ + 1,
        );
  }
  assert.equal(b.soldiers.length, 4);
  assert.equal(new Set(b.soldiers.map((s) => s.id)).size, 4);
  assert.ok(b.soldiers.every((s) => s.coverIndex === 2 && s.z > -40));
  assert.equal(b.jeeps[0].passengers, 0);
});
void test('wind-up can be interrupted, but a released grenade still hits after its thrower dies', () => {
  const b = battle();
  b.spawnTimer = 0;
  b.jeepSpawned = 1;
  stepPillbox(b, 0.01, false);
  b.spawnTimer = 1000;
  const s = b.soldiers[0];
  s.x = 0;
  s.z = -30;
  stepPillbox(b, 0.5, false);
  assert.equal(s.grenadeState, 'windup');
  assert.equal(b.health, 100);
  aimPillbox(b, s.x, s.z);
  stepPillbox(b, 0.01, true);
  advance(b, 3);
  assert.equal(b.health, 100);
  assert.equal(b.grenades.length, 0);
  const c = battle();
  c.spawnTimer = 0;
  c.jeepSpawned = 1;
  stepPillbox(c, 0.01, false);
  c.spawnTimer = 1000;
  const thrower = c.soldiers[0];
  thrower.x = 0;
  thrower.z = -30;
  advance(c, 1.5);
  assert.equal(c.grenades.length, 1);
  aimPillbox(c, thrower.x, thrower.z);
  stepPillbox(c, 0.01, true);
  advance(c, 2.3);
  assert.equal(c.health, 88);
  assert.equal(c.grenades.length, 0);
});
void test('pending jeeps and airborne grenades prevent premature victory and pause freezes threats', () => {
  const b = battle();
  b.wave = 3;
  b.spawned = 30;
  b.jeepSpawned = 0;
  b.jeepTimer = 5;
  stepPillbox(b, 0.05, false);
  assert.equal(b.status, 'playing');
  b.jeepSpawned = 3;
  b.grenades = [{ id: 1, x: 0, z: -30, age: 0 }];
  stepPillbox(b, 0.05, false);
  assert.equal(b.status, 'playing');
  b.status = 'paused';
  const before = structuredClone(b);
  stepPillbox(b, 10, true);
  assert.deepEqual(b, before);
  b.status = 'playing';
  advance(b, 3);
  assert.equal(b.status, 'won');
  assert.equal(b.health, 88);
});
