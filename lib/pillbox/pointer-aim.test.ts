import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { PointerAim } from './pointer-aim';
import { LandingCraftRenderer } from './landing-craft';
import { createPillboxBattle } from './simulation';

void test('sweeping a craft ramp moves the reticle even when target assistance holds the same part', () => {
  const world = new THREE.Scene();
  const renderer = new LandingCraftRenderer(world);
  const battle = createPillboxBattle();
  battle.landingCraft = battle.landingCraft.filter((c) => c.lane === 2);
  Object.assign(battle.landingCraft[0], { z: -140, phase: 'lowering' });
  renderer.render(battle);
  const pointer = new PointerAim();
  const ray = new THREE.Raycaster();
  const from = new THREE.Vector3(0, 9.2, 8.2);
  const rect = { left: 100, top: 50 };
  const positions: number[] = [];
  for (const x of [-1.5, -1, -0.5, 0, 0.5, 1, 1.5]) {
    pointer.move(300 + x * 10, 200);
    const target = pointer.resolve((clientX) => {
      ray.set(
        from,
        new THREE.Vector3((clientX - 300) / 10, 2, -134).sub(from).normalize(),
      );
      return renderer.pick(ray);
    });
    assert.deepEqual(target, { x: 0, z: -134 });
    positions.push(pointer.screen(rect)!.x);
  }
  assert.deepEqual(positions, [185, 190, 195, 200, 205, 210, 215]);
  renderer.dispose();
});

void test('high-rate mouse input performs only one target query per frame, using the newest sample', () => {
  const pointer = new PointerAim();
  let queries = 0;
  for (let frame = 0; frame < 60; frame++) {
    for (let event = 0; event < 30; event++)
      pointer.move(frame * 30 + event, 180);
    assert.deepEqual(
      pointer.resolve((x) => {
        queries++;
        return { x, z: -140 };
      }),
      { x: frame * 30 + 29, z: -140 },
    );
    assert.equal(
      pointer.resolve(() => {
        throw new Error('Idle input was picked again');
      }),
      null,
    );
  }
  assert.equal(queries, 60, '1,800 mouse events collapse to 60 picks');
});

void test('keyboard, wheel, menu and pause handoffs discard queued mouse aim and its cursor', () => {
  const pointer = new PointerAim();
  pointer.move(400, 250);
  pointer.clear();
  assert.equal(pointer.screen({ left: 0, top: 0 }), null);
  assert.equal(
    pointer.resolve(() => {
      throw new Error('Old mouse input overwrote another control');
    }),
    null,
  );
  pointer.move(430, 230);
  assert.equal(
    pointer.resolve(() => null),
    null,
  );
  assert.deepEqual(pointer.screen({ left: 20, top: 10 }), { x: 410, y: 220 });
});

void test('touch swipes travel in screen pixels and cannot stick to assisted targets', () => {
  const pointer = new PointerAim();
  const sameRamp = () => ({ x: 0, z: -134 });
  pointer.moveRelative(12, -6, { x: 200, y: 170 });
  assert.deepEqual(pointer.resolve(sameRamp), { x: 0, z: -134 });
  assert.deepEqual(pointer.screen({ left: 0, top: 0 }), { x: 212, y: 164 });
  pointer.moveRelative(12, -6, { x: 200, y: 170 });
  pointer.resolve(sameRamp);
  assert.deepEqual(pointer.screen({ left: 0, top: 0 }), { x: 224, y: 158 });
  // A stationary finger never queues continued motion or another target query.
  assert.equal(
    pointer.resolve(() => {
      throw new Error('Aim drifted while held');
    }),
    null,
  );
});

void test('touch events coalesce into one pick without losing fine drag distance', () => {
  const pointer = new PointerAim();
  for (let i = 0; i < 30; i++)
    pointer.moveRelative(0.5, -0.25, { x: 100, y: 200 });
  let picks = 0;
  pointer.resolve((x, y) => {
    picks++;
    return { x, z: -y };
  });
  assert.equal(picks, 1);
  assert.deepEqual(pointer.screen({ left: 0, top: 0 }), { x: 115, y: 192.5 });
});

void test('touch aim stops at the reachable edge and reverses without dead travel', () => {
  const pointer = new PointerAim();
  const pick = (x: number, y: number) =>
    x <= 100 && x >= 0 && y >= 50 ? { x, z: -y } : null;
  pointer.moveRelative(60, 0, { x: 80, y: 100 });
  const edge = pointer.resolve(pick)!;
  assert.ok(edge.x <= 100 && edge.x > 99.5);
  pointer.moveRelative(-3, 0, { x: 0, y: 0 });
  const reversed = pointer.resolve(pick)!;
  assert.ok(Math.abs(reversed.x - (edge.x - 3)) < 1e-8);
  pointer.clear();
  assert.equal(pointer.screen({ left: 0, top: 0 }), null);
  pointer.moveRelative(1, 1, { x: 10, y: 60 });
  assert.deepEqual(pointer.resolve(pick), { x: 11, z: -61 });
});
