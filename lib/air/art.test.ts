import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { AirArt, makeAirframe, makeCoast, makeTargetModel } from './art';
import { createTargets, shoreline, terrainHeight } from './targets';
import { makeCoastalAtmosphere } from './coastal-atmosphere';

void test('refined coastline stays on the ballistic terrain and owns all rendering resources', () => {
  const art = new AirArt();
  // Keep file IO out of this geometry/resource test; browser checks use the real maps.
  art.texture = () => {
    const texture = new THREE.Texture<HTMLImageElement>();
    art.textures.add(texture);
    return texture;
  };
  const coast = makeCoast(art);
  const terrain = coast.children[0] as THREE.Mesh;
  const vertices = terrain.geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      z = vertices.getZ(i),
      y = vertices.getY(i);
    assert.ok(Number.isFinite(x + y + z));
    if (x >= shoreline(z)) assert.ok(Math.abs(y - terrainHeight(x, z)) < 0.001);
    else assert.ok(y < 0);
  }
  const aircraft = makeAirframe(art);
  const targets = createTargets().map((target) => makeTargetModel(art, target));
  const atmosphere = makeCoastalAtmosphere(art);
  for (const root of [
    coast,
    aircraft.root,
    atmosphere.root,
    ...targets.map((t) => t.root),
  ]) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      assert.ok(art.geometries.has(object.geometry));
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) assert.ok(art.materials.has(material));
      for (const n of object.geometry.attributes.position.array)
        assert.ok(Number.isFinite(n));
    });
  }
  const resources = [...art.geometries, ...art.materials, ...art.textures];
  const counts = new Map(resources.map((resource) => [resource, 0]));
  resources.forEach((resource) =>
    resource.addEventListener('dispose', () =>
      counts.set(resource, counts.get(resource)! + 1),
    ),
  );
  atmosphere.dispose();
  art.dispose();
  art.dispose();
  assert.ok([...counts.values()].every((count) => count === 1));
});

void test('atmosphere is driven by mission time, without allocating during pause or restart', () => {
  const art = new AirArt(),
    atmosphere = makeCoastalAtmosphere(art);
  const before = [art.geometries.size, art.materials.size, art.textures.size];
  for (let i = 0; i < 1000; i++) atmosphere.update(i < 500 ? 12 : 0);
  atmosphere.root.traverse((object) => {
    if (object instanceof THREE.Mesh)
      assert.equal(object.material.uniforms.time.value, 0);
  });
  assert.deepEqual(
    [art.geometries.size, art.materials.size, art.textures.size],
    before,
  );
  atmosphere.dispose();
  art.dispose();
});
