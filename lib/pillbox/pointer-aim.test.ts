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
