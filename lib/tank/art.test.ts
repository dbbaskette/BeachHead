import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { consolidateTank } from './art';
void test('rounded and indexed geometry batch together without losing parts or doubling group transforms', () => {
  const parent = new T.Group(),
    root = new T.Group();
  parent.position.set(30, 0, -40);
  root.position.set(4, 0, 2);
  parent.add(root);
  const mat = new T.MeshStandardMaterial(),
    rounded = new RoundedBoxGeometry(2, 2, 2, 2, 0.1),
    sphere = new T.SphereGeometry(1, 12, 8);
  const a = new T.Mesh(rounded, mat),
    b = new T.Mesh(sphere, mat);
  b.position.x = 4;
  root.add(a, b);
  const resources: T.BufferGeometry[] = [];
  consolidateTank(root, {
    geo: <G extends T.BufferGeometry>(g: G) => {
      resources.push(g);
      return g;
    },
  });
  assert.equal(root.children.length, 1);
  const mesh = root.children[0] as T.Mesh;
  mesh.geometry.computeBoundingBox();
  assert.ok(mesh.geometry.boundingBox!.min.x < -0.9);
  assert.ok(mesh.geometry.boundingBox!.max.x > 4.9);
  assert.equal(root.position.x, 4);
  assert.equal(root.position.z, 2);
  assert.ok(mesh.castShadow && mesh.receiveShadow);
  for (const g of resources) g.dispose();
  rounded.dispose();
  sphere.dispose();
  mat.dispose();
});
