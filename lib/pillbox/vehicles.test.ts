import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { VehicleRenderer } from './vehicles';
import { createPillboxBattle, stepPillbox } from './simulation';
void test('vehicle visuals clear on retry and release shared graphics resources', () => {
  const scene = new THREE.Scene(),
    renderer = new VehicleRenderer(scene),
    b = createPillboxBattle();
  b.status = 'playing';
  b.jeepTimer = 0;
  stepPillbox(b, 0.1, false);
  b.grenades = [{ id: 1, x: 0, z: -30, age: 1 }];
  renderer.render(b, 0.1);
  assert.ok(scene.children.length >= 2);
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  let geoCount = 0,
    matCount = 0;
  geometries.forEach((g) => g.addEventListener('dispose', () => geoCount++));
  materials.forEach((m) => m.addEventListener('dispose', () => matCount++));
  renderer.render(createPillboxBattle(), 0);
  assert.equal(scene.children.length, 0);
  renderer.dispose();
  assert.equal(geoCount, geometries.size);
  assert.equal(matCount, materials.size);
});
