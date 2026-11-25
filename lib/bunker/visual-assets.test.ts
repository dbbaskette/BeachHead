import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { guardClips } from './uniform';
import {
  addBunkerDetail,
  worldArchUV,
  worldCylinderUV,
  worldUV,
} from './detail';

void test('WWII guard asset has a usable skeleton and stays human sized throughout its patrol cycle', async () => {
  const bytes = await readFile(
    new URL('../../public/models/bunker/ww2-soldier.glb', import.meta.url),
  );
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const model = gltf.scene;
  for (const name of [
    'Hips',
    'Head',
    'LeftArm',
    'RightArm',
    'LeftForeArm',
    'RightForeArm',
    'LeftUpLeg',
    'RightUpLeg',
  ])
    assert.ok(model.getObjectByName(name), name);
  let skinned = 0;
  model.traverse((o) => {
    if (o instanceof T.SkinnedMesh) {
      skinned++;
      const weights = o.geometry.getAttribute('skinWeight');
      for (let i = 0; i < weights.count; i++)
        assert.ok(
          Math.abs(
            weights.getX(i) +
              weights.getY(i) +
              weights.getZ(i) +
              weights.getW(i) -
              1,
          ) < 0.001,
        );
    }
  });
  assert.ok(skinned > 0);
  const mixer = new T.AnimationMixer(model);
  const clips = guardClips(model);
  for (const clip of clips) {
    mixer.stopAllAction();
    mixer.clipAction(clip).play();
    for (let i = 0; i < 24; i++) {
      mixer.update(0.05);
      model.updateMatrixWorld(true);
      const size = new T.Box3()
        .setFromObject(model, true)
        .getSize(new T.Vector3());
      assert.ok(size.y > 150 && size.y < 200, `height ${size.y}`);
      assert.ok(
        size.x < 190 && size.z < 100,
        'no exploded skinning or runaway translation',
      );
    }
  }
});
void test('concrete texel density follows wall dimensions instead of stretching to fit each box', () => {
  for (const [w, h, d] of [
    [14, 4.6, 0.5],
    [4, 0.3, 12],
  ]) {
    const geo = worldUV(new T.BoxGeometry(w, h, d));
    const uv = geo.getAttribute('uv');
    // First face is X-facing and therefore spans depth horizontally, height vertically.
    assert.equal(Math.abs(uv.getX(0) - uv.getX(1)), d);
    assert.ok(Math.abs(Math.abs(uv.getY(0) - uv.getY(2)) - h) < 0.00001);
    geo.dispose();
  }

  // Diagonal 45° faces resolve consistently without falling back to the Z axis.
  const bevel = new T.BufferGeometry();
  bevel.setAttribute(
    'position',
    new T.Float32BufferAttribute([1, 2, 5, 1, 2, 7], 3),
  );
  bevel.setAttribute(
    'normal',
    new T.Float32BufferAttribute(
      [Math.SQRT1_2, Math.SQRT1_2, 0, Math.SQRT1_2, Math.SQRT1_2, 0],
      3,
    ),
  );
  bevel.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 0, 0], 2));
  worldUV(bevel);
  const buv = bevel.getAttribute('uv');
  assert.ok(Math.abs(buv.getX(1) - buv.getX(0) - 2) < 1e-6);
  bevel.dispose();

  const cyl = worldCylinderUV(
    new T.CylinderGeometry(0.5, 0.5, 12, 16),
    0.5,
    12,
  );
  const cuv = cyl.getAttribute('uv');
  let maxU = 0,
    maxV = 0;
  for (let i = 0; i < cuv.count; i++) {
    maxU = Math.max(maxU, cuv.getX(i));
    maxV = Math.max(maxV, cuv.getY(i));
  }
  assert.ok(Math.abs(maxU - Math.PI) < 1e-4);
  assert.ok(Math.abs(maxV - 12) < 1e-4);
  cyl.dispose();

  const arch = worldArchUV(new T.BoxGeometry(2, 2, 10), 2.25, 1.8);
  arch.dispose();
});

void test('bunker detail orients wall grime and tie-holes outward and omits duplicate tunnel vault', () => {
  const scene = new T.Scene();
  const mat = new T.MeshStandardMaterial();
  addBunkerDetail(scene, mat, mat, mat, mat);

  const wallPatches: T.Mesh[] = [];
  const tieHoles: T.Mesh[] = [];
  let hasTunnelVaultClone = false;
  scene.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    if (o.geometry instanceof T.PlaneGeometry) wallPatches.push(o);
    if (o.geometry instanceof T.CircleGeometry) tieHoles.push(o);
    if (
      o.geometry instanceof T.CylinderGeometry &&
      Math.abs(o.geometry.parameters.radiusTop - 1.72) < 1e-4
    ) {
      hasTunnelVaultClone = true;
    }
  });

  assert.equal(
    hasTunnelVaultClone,
    false,
    'duplicate Service Tunnel vault removed',
  );
  assert.ok(wallPatches.length > 0);
  assert.ok(tieHoles.length > 0);
  for (const patch of wallPatches) {
    assert.equal(patch.castShadow, false);
    assert.ok(Math.abs(Math.abs(patch.rotation.y) - Math.PI / 2) < 1e-6);
  }
  for (const hole of tieHoles) {
    assert.equal(hole.castShadow, false);
    assert.ok(Math.abs(Math.abs(hole.rotation.y) - Math.PI / 2) < 1e-6);
  }
  // Paired +/- sides on the corridor tunnel (x = ±2) have opposite outward normals (+PI/2 on east face, -PI/2 on west face).
  const eastSide = wallPatches.filter(
    (m) => Math.abs(m.position.x - -1.738) < 0.01,
  );
  const westSide = wallPatches.filter(
    (m) => Math.abs(m.position.x - -2.262) < 0.01,
  );
  assert.ok(eastSide.length > 0 && westSide.length > 0);
  assert.ok(eastSide.every((m) => m.rotation.y > 0));
  assert.ok(westSide.every((m) => m.rotation.y < 0));

  scene.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.geometry.dispose();
      if (!Array.isArray(o.material)) o.material.dispose();
    }
  });
  mat.dispose();
});
