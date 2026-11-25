import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { AirArt } from '../air/art';
import { consolidate } from './art';
import { flakCoastHeight } from './scene';

void test('consolidate disables castShadow for transparent decals and prop blurs while preserving opaque casters', () => {
  const art = new AirArt();
  const root = new THREE.Group();
  const opaque = art.mat('#556655', 0.7);
  const decal = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.1,
  });
  art.materials.add(decal);

  art.mesh(root, art.box, opaque, [0, 1, 0], [1, 1, 1]);
  art.mesh(root, art.box, decal, [0, 2, 0], [1, 1, 1]);

  consolidate(root, art);
  assert.equal(root.children.length, 2);
  for (const child of root.children) {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.Material;
    assert.equal(mesh.castShadow, !mat.transparent);
    assert.equal(mesh.receiveShadow, true);
  }
  art.dispose();
});

void test('flakCoastHeight keeps the battery plateau level and slopes smoothly below sea level offshore', () => {
  assert.ok(flakCoastHeight(0, 4) > 2.2);
  assert.ok(flakCoastHeight(0, -130) < -1.5);
  for (let z = -140; z <= 200; z += 10) {
    const h = flakCoastHeight(25, z);
    assert.ok(Number.isFinite(h));
  }
});
