import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { consolidateTank, makeCover, makeTank, TankArt } from './art';
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

void test('makeTank enables shadow casting and receiving across turret, barrel, wheels, and tracks while excluding transparent markings', () => {
  const a = Object.create(TankArt.prototype) as TankArt;
  a.geometries = new Set();
  a.materials = new Set();
  a.textures = new Set();
  a.rounded = a.geo(new RoundedBoxGeometry(1, 1, 1, 2, 0.08));
  a.box = a.geo(new T.BoxGeometry(1, 1, 1));
  a.round = a.geo(new T.SphereGeometry(1, 12, 8));
  a.cylinder = a.geo(new T.CylinderGeometry(1, 1, 1, 12));
  a.fender = a.geo(new T.TorusGeometry(0.65, 0.2, 6, 12));
  a.paint = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  a.textures.add(a.paint);
  a.olive = a.mat('#555c3e', 0.72);
  a.dark = a.mat('#1f292b', 0.74);
  a.pale = a.mat('#bdbbae', 0.7);
  a.rubber = a.mat('#181b1a', 1);
  a.wood = a.mat('#74634a', 0.95);

  const tank = makeTank(a, false);
  let opaqueTurretMeshes = 0;
  let markingMeshes = 0;
  tank.turret.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    if (!Array.isArray(o.material) && o.material.transparent) {
      markingMeshes++;
      assert.equal(o.castShadow, false);
      assert.equal(o.receiveShadow, true);
    } else {
      opaqueTurretMeshes++;
      assert.equal(o.castShadow, true);
      assert.equal(o.receiveShadow, true);
    }
  });
  assert.ok(opaqueTurretMeshes > 0);
  assert.equal(markingMeshes, 2);

  let barrelMeshes = 0;
  tank.barrel.traverse((o) => {
    if (o instanceof T.Mesh) {
      barrelMeshes++;
      assert.equal(o.castShadow, true);
      assert.equal(o.receiveShadow, true);
    }
  });
  assert.ok(barrelMeshes > 0);
  assert.equal(tank.wheels.length, 12);
  for (const wheel of tank.wheels) {
    assert.equal(wheel.castShadow, true);
    assert.equal(wheel.receiveShadow, true);
  }
  assert.equal(tank.tracks.castShadow, true);
  assert.equal(tank.tracks.receiveShadow, true);
  tank.tracks.dispose();
  a.dispose();
});
