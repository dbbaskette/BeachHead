import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { guardClips } from './uniform';
import { worldUV } from './detail';

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
});
