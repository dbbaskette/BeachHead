import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { consolidateTank, makeCover, TankArt } from './art';
import { village } from './map';
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

void test('intact house stays batched while hidden fracture panels preserve the complete model', () => {
  // Geometry fixture exercises production batching without loading browser textures.
  const a = Object.create(TankArt.prototype) as TankArt;
  a.geometries = new Set();
  a.materials = new Set();
  a.textures = new Set();
  a.rounded = a.geo(new RoundedBoxGeometry(1, 1, 1, 2, 0.08));
  a.box = a.geo(new T.BoxGeometry(1, 1, 1));
  a.stone = a.mat('#aaa', 1);
  a.roof = a.mat('#555', 1);
  a.wood = a.mat('#765', 1);
  a.dark = a.mat('#222', 1);
  const c = village().find((c) => c.kind === 'house')!;
  const model = makeCover(a, c);
  assert.equal(model.fractured.visible, false);
  assert.equal(model.collapseParts.length, 6);
  assert.equal(model.intact.children.length, 4);
  const count = (root: T.Group) => {
    let n = 0;
    root.traverse((o) => {
      if (o instanceof T.Mesh) n += o.geometry.attributes.position.count;
    });
    return n;
  };
  assert.equal(count(model.intact), count(model.fractured));
  const intactBox = new T.Box3().setFromObject(model.intact);
  const fracturedBox = new T.Box3().setFromObject(model.fractured);
  assert.ok(intactBox.min.distanceTo(fracturedBox.min) < 1e-5);
  assert.ok(intactBox.max.distanceTo(fracturedBox.max) < 1e-5);
  a.dispose();
});
