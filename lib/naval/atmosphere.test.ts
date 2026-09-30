import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { CoastalAtmosphere } from './atmosphere';
import { COASTAL_SUN, makeDaylightSky } from './daylight';

for (const setting of ['beach', 'naval'] as const) {
  void test(`${setting} weather is reproducible, continuous, bounded and freezes at the same time`, () => {
    const scene = new THREE.Scene();
    const weather = new CoastalAtmosphere(scene, setting, 1944);
    const other = new CoastalAtmosphere(new THREE.Scene(), setting, 1944);
    const snapshot = () =>
      weather.root.children.map((o) => [
        ...o.position.toArray(),
        ...o.rotation.toArray(),
        o.visible,
      ]);
    weather.update(5);
    const first = snapshot();
    weather.update(5);
    assert.deepEqual(snapshot(), first);
    other.update(5);
    assert.deepEqual(
      other.root.children.map((o) => [
        ...o.position.toArray(),
        ...o.rotation.toArray(),
        o.visible,
      ]),
      first,
    );
    const count = weather.root.children.length;
    for (let i = 0; i < 600; i++) weather.update(i * 3.1);
    assert.equal(weather.root.children.length, count);
    const plane = weather.root.getObjectByName('coastal-flyover-0')!;
    weather.update(5);
    const x = plane.position.x;
    weather.update(5.01);
    assert.ok(
      Math.abs(plane.position.x - x - 0.83) < 0.000001,
      'aircraft travels at 83 metres per second',
    );
    const bank = weather.root.getObjectByName(
      'drifting-sea-mist',
    ) as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    assert.ok(
      bank.material.uniforms.density.value >= 0.2 &&
        bank.material.uniforms.density.value <= 0.56,
    );
    weather.dispose();
    other.dispose();
  });
}
void test('shared aircraft resources and mist materials are disposed exactly once', () => {
  const scene = new THREE.Scene(),
    weather = new CoastalAtmosphere(scene, 'beach', 10);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  weather.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      resources.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        resources.add(m);
    }
  });
  let disposed = 0;
  for (const r of resources) r.addEventListener('dispose', () => disposed++);
  weather.dispose();
  weather.dispose();
  assert.equal(disposed, resources.size);
  assert.equal(scene.children.length, 0);
});
void test('daylight and water share a normalized sun direction', () => {
  const sky = makeDaylightSky();
  assert.ok(Math.abs(COASTAL_SUN.length() - 1) < 1e-10);
  assert.ok(
    sky.material.uniforms.sunPosition.value
      .clone()
      .normalize()
      .distanceTo(COASTAL_SUN) < 1e-10,
  );
  sky.geometry.dispose();
  sky.material.dispose();
});
