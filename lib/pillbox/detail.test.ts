import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { BeachDetail } from './detail';

void test('battlefield dressing releases its geometry, materials and instance buffers on stage exit', () => {
  const scene = new THREE.Scene();
  const detail = new BeachDetail(scene);
  const resources = new Set<
    THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh
  >();
  const released = new Set<unknown>();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        resources.add(material);
    }
    if (object instanceof THREE.InstancedMesh) resources.add(object);
  });
  for (const resource of resources) {
    const onDispose = () => {
      released.add(resource);
    };
    if (resource instanceof THREE.InstancedMesh)
      resource.addEventListener('dispose', onDispose);
    else if (resource instanceof THREE.Material)
      resource.addEventListener('dispose', onDispose);
    else resource.addEventListener('dispose', onDispose);
  }
  assert.ok(resources.size > 20);
  detail.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(released.size, resources.size);
  assert.doesNotThrow(() => detail.dispose());
});
