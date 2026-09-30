import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createPillboxBattle, stepPillbox } from './simulation';
import {
  createLandingCraft,
  BERTH_Z,
  landingDeckHeight,
  RAMP_END_Z,
} from './landings';
import { nextInfantryId } from './landings';
import { LandingCraftRenderer, embarkedInfantry } from './landing-craft';
import { WAVE_COUNTS } from './types';

void test('wave passengers arrive by craft and walk onto land before boats withdraw', () => {
  for (let wave = 1; wave <= 3; wave++) {
    const b = createPillboxBattle();
    b.wave = wave;
    b.landingCraft = createLandingCraft(wave);
    b.pendingInfantry = Array.from({ length: WAVE_COUNTS[wave - 1] }, (_, i) =>
      nextInfantryId(wave, i),
    );
    b.landingCraft.forEach((c) => (c.gunnerHealth = 0));
    b.status = 'playing';
    b.jeepSpawned = wave;
    assert.equal(
      b.landingCraft.reduce((sum, c) => sum + c.passengers, 0),
      WAVE_COUNTS[wave - 1],
    );
    stepPillbox(b, 0.1, false);
    assert.equal(
      b.spawned,
      0,
      'no infantry teleport ashore ahead of the boats',
    );
    const appeared = new Set<number>();
    for (let i = 0; i < 1100; i++) {
      stepPillbox(b, 0.025, false);
      for (const soldier of b.soldiers) {
        if (!appeared.has(soldier.id)) {
          const craft = b.landingCraft.find(
            (c) => c.id === soldier.landingCraftId,
          )!;
          assert.ok(craft);
          assert.equal(craft.z, BERTH_Z);
          assert.equal(craft.ramp, 1);
          assert.equal(craft.phase, 'unloading');
          appeared.add(soldier.id);
        }
      }
      for (const c of b.landingCraft)
        if (c.phase === 'withdrawing')
          assert.ok(!b.soldiers.some((s) => s.landingCraftId === c.id));
    }
    assert.equal(appeared.size, WAVE_COUNTS[wave - 1]);
    assert.ok(
      b.soldiers.every(
        (s) => s.z >= RAMP_END_Z && s.landingCraftId === undefined,
      ),
    );
    assert.ok(b.landingCraft.every((c) => c.passengers === 0));
    b.status = 'paused';
    const before = structuredClone(b);
    stepPillbox(b, 5, false);
    assert.deepEqual(b, before);
  }
});
void test('ramps connect the deck to the beach without a height discontinuity', () => {
  assert.equal(landingDeckHeight(-142, 18), 0.72);
  assert.ok(landingDeckHeight(-133, 18) < 0.72);
  assert.ok(Math.abs(landingDeckHeight(-132, 18) + 0.455) < 0.001);
});
void test('landing craft reuse geometry, reset and release their resources', () => {
  const scene = new THREE.Scene(),
    renderer = new LandingCraftRenderer(scene),
    b = createPillboxBattle();
  renderer.render(b);
  assert.equal(scene.children.length, 10);
  assert.equal(embarkedInfantry(b).length, 18);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      resources.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        resources.add(m);
    }
  });
  let disposed = 0;
  for (const resource of resources)
    resource.addEventListener('dispose', () => disposed++);
  renderer.render(b);
  assert.equal(scene.children.length, 10);
  b.landingCraft = [];
  renderer.render(b);
  assert.equal(scene.children.length, 0);
  renderer.render(createPillboxBattle());
  assert.equal(scene.children.length, 10);
  renderer.dispose();
  renderer.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, resources.size);
});
