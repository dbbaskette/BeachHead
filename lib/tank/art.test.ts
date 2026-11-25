import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { consolidateTank, makeAlly, makeCover, makeTank, TankArt } from './art';
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
  assert.equal(tank.sprockets.length, 4);
  for (const sprocket of tank.sprockets) {
    assert.equal(sprocket.castShadow, true);
    assert.equal(sprocket.receiveShadow, true);
    assert.ok(Math.abs(Math.abs(sprocket.position.x) - 1.43) < 1e-6);
    assert.ok(Math.abs(sprocket.position.y - 0.62) < 1e-6);
    assert.ok(Math.abs(Math.abs(sprocket.position.z) - 2.15) < 1e-6);
  }
  tank.tracks.dispose();
  a.dispose();
});

void test('world-space UVs scale scaled house panels while preserving alpha-tested leaf quads, and Panzer/Allies stay distinct', () => {
  const a = Object.create(TankArt.prototype) as TankArt;
  a.geometries = new Set();
  a.materials = new Set();
  a.textures = new Set();
  a.rounded = a.geo(new RoundedBoxGeometry(1, 1, 1, 2, 0.08));
  a.box = a.geo(new T.BoxGeometry(1, 1, 1));
  a.round = a.geo(new T.SphereGeometry(1, 12, 8));
  a.cylinder = a.geo(new T.CylinderGeometry(1, 1, 1, 12));
  a.fender = a.geo(new T.TorusGeometry(0.65, 0.2, 6, 12));
  a.foliage = a.geo(new T.PlaneGeometry(1, 1));
  a.olive = a.mat('#555c3e', 0.72);
  a.dark = a.mat('#1f292b', 0.74);
  a.pale = a.mat('#bdbbae', 0.7);
  a.rubber = a.mat('#181b1a', 1);
  a.wood = a.mat('#74634a', 0.95);
  a.stone = a.mat('#aaa', 0.92);
  a.stone.userData.worldUVScale = 0.5;
  a.roof = a.mat('#555', 0.88);
  a.leaves = a.mat('#99a982', 0.97);
  a.leaves.alphaTest = 0.45;
  a.leaves.userData.preserveUV = true;

  // Scaled house box receives world-scale UV span instead of [0, 1] unit UVs.
  const houseGroup = new T.Group();
  const longWall = new T.Mesh(a.rounded, a.stone);
  longWall.scale.set(12, 4, 0.7);
  houseGroup.add(longWall);
  consolidateTank(houseGroup, a);
  const mergedWall = houseGroup.children[0] as T.Mesh;
  const wuv = mergedWall.geometry.getAttribute('uv');
  let maxU = 0;
  for (let i = 0; i < wuv.count; i++)
    maxU = Math.max(maxU, Math.abs(wuv.getX(i)));
  assert.ok(maxU > 2.5, 'long scaled wall UV spans world metres, not [0, 1]');

  // Alpha-tested leaf card retains exact [0, 1] UVs inside consolidateTank.
  const leafGroup = new T.Group();
  const card = new T.Mesh(a.foliage, a.leaves);
  card.scale.set(4, 4, 1);
  leafGroup.add(card);
  consolidateTank(leafGroup, a);
  const mergedLeaf = leafGroup.children[0] as T.Mesh;
  const luv = mergedLeaf.geometry.getAttribute('uv');
  let leafMin = Infinity,
    leafMax = -Infinity;
  for (let i = 0; i < luv.count; i++) {
    leafMin = Math.min(leafMin, luv.getX(i), luv.getY(i));
    leafMax = Math.max(leafMax, luv.getX(i), luv.getY(i));
  }
  assert.equal(leafMin, 0);
  assert.equal(leafMax, 1);

  // Sherman turret star markings sit outside the curved (1.2, 0.65, 1.48) ellipsoid; Panzer has a longer front silhouette.
  const sherman = makeTank(a, false);
  sherman.turret.traverse((o) => {
    if (
      o instanceof T.Mesh &&
      !Array.isArray(o.material) &&
      o.material.transparent
    ) {
      const pos = o.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i),
          py = pos.getY(i) - 0.35,
          pz = pos.getZ(i) - 0.15;
        const ellip =
          (px * px) / (1.2 * 1.2) +
          (py * py) / (0.65 * 0.65) +
          (pz * pz) / (1.48 * 1.48);
        assert.ok(
          ellip > 1,
          `marking vertex must stay outside turret surface (got ${ellip})`,
        );
      }
    }
  });
  const panzer = makeTank(a, true);
  const shermanBarrelBox = new T.Box3().setFromObject(sherman.barrel);
  const panzerBarrelBox = new T.Box3().setFromObject(panzer.barrel);
  assert.ok(
    panzerBarrelBox.min.z < shermanBarrelBox.min.z - 0.4,
    'Panzer high-velocity barrel extends noticeably further forward than Sherman',
  );
  sherman.tracks.dispose();
  panzer.tracks.dispose();

  // Allied infantry GI has separate articulated leg/arm groups for walk animation.
  const gi = makeAlly(a);
  assert.ok(gi.leftLeg.children.length > 0 && gi.rightLeg.children.length > 0);
  assert.ok(gi.leftArm.children.length > 0 && gi.rightArm.children.length > 0);
  a.dispose();
});
