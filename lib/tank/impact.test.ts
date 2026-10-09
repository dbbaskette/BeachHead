import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collapsePose, stepFragment } from './impact';
import { createTank, stepTank, emptyTankInput } from './simulation';
void test('roof loses support before wall panels and drops under gravity without growing or folding', () => {
  const roof = collapsePose(0.4, 4, 8, 1),
    wall = collapsePose(0.4, 2, 8, 1);
  assert.ok(roof.y < -0.3);
  assert.ok(Math.abs(wall.x) < 0.01);
  let previous = 0;
  for (let t = 0; t < 3; t += 0.05) {
    const p = collapsePose(t, 4, 8, 1);
    assert.ok(p.y <= previous + 1e-9);
    assert.ok(p.y >= -7.3);
    previous = p.y;
  }
  assert.equal(collapsePose(2.2, 4, 8, 1).visible, false);
  const left = collapsePose(0.8, 4, 8, 1),
    right = collapsePose(0.8, 5, 8, 1);
  assert.ok(left.y < right.y && right.y < 0);
  assert.ok(left.x > 0 && right.x < 0);
  assert.ok(left.z > 0 && right.z < 0);
  assert.ok(collapsePose(1.5, 0, 8, 1).z < 0);
  assert.ok(collapsePose(1.5, 1, 8, 1).z > 0);
});
void test('debris bounces with energy loss and comes to rest above the ground', () => {
  const p = { x: 0, y: 3, z: 0, vx: 4, vy: 1, vz: 2 };
  for (let i = 0; i < 600; i++) {
    stepFragment(p, 1 / 60);
    assert.ok(p.y >= 0.08);
  }
  assert.equal(p.y, 0.08);
  assert.equal(p.vy, 0);
  assert.ok(Math.hypot(p.vx, p.vz) < 0.001);
});
void test('swept cover impact emits exact surface coordinates, material and one destruction event', () => {
  for (const kind of ['house', 'fence'] as const) {
    const s = createTank();
    s.status = 'playing';
    s.enemies.forEach((e) => (e.active = false));
    const c = s.cover.find((c) => c.kind === kind)!;
    s.cover = [c];
    c.x = 0;
    c.z = -10;
    c.h = 6;
    c.y = 3;
    c.w = 6;
    c.d = 2;
    c.health = 180;
    let destroys = 0;
    for (let hit = 0; hit < 3; hit++) {
      s.shells.push({
        id: 900 + hit,
        x: 0,
        y: 3,
        z: 0,
        vx: 0,
        vy: 0,
        vz: -260,
        age: 0,
        enemy: false,
        mg: false,
        damage: 95,
        source: 'player',
      });
      for (let i = 0; i < 6; i++) {
        stepTank(s, 1 / 60, emptyTankInput());
        for (const e of s.events.filter((e) => e.coverId === c.id)) {
          assert.equal(e.surface, kind === 'house' ? 'masonry' : 'wood');
          assert.deepEqual(e.normal, { x: 0, y: 0, z: 1 });
          assert.ok(Math.abs(e.at.z + 9) < 1e-6);
          if (e.kind === 'destroy') destroys++;
        }
      }
    }
    assert.equal(destroys, 1);
  }
});
