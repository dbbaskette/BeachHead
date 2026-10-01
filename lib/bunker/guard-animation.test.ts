import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import {
  animateGuard,
  resetGuardActor,
  type GuardActor,
} from './guard-animation';
import { PELVIS_HEIGHT } from './reactions';
import { createBunker } from './simulation';
import { guardClips } from './uniform';
async function sourceModel() {
  const b = await readFile(
    new URL('../../public/models/bunker/ww2-soldier.glb', import.meta.url),
  );
  return (
    await new GLTFLoader().parseAsync(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      '',
    )
  ).scene;
}
function rig(source: T.Object3D, scene: T.Scene): GuardActor {
  const bounds = new T.Box3().setFromObject(source),
    model = clone(source),
    scale = 1.8 / (bounds.max.y - bounds.min.y);
  const root = new T.Group(),
    body = new T.Group();
  root.add(body);
  body.position.y = -PELVIS_HEIGHT;
  body.add(model);
  scene.add(root);
  model.scale.setScalar(scale);
  model.position.y = -bounds.min.y * scale;
  model.rotation.y = Math.PI;
  const rifle = new T.Group();
  rifle.add(new T.Mesh(new T.BoxGeometry(0.09, 0.1, 1)));
  body.add(rifle);
  rifle.position.set(0, 1.25, -0.35);
  const flash = new T.Mesh();
  rifle.add(flash);
  const mixer = new T.AnimationMixer(model),
    clips = guardClips(model),
    idle = mixer.clipAction(clips[0]),
    walk = mixer.clipAction(clips[1]);
  idle.play();
  walk.play();
  walk.setEffectiveWeight(0);
  const names = [
    'Spine',
    'Spine1',
    'Spine2',
    'Neck',
    'Head',
    'LeftUpLeg',
    'RightUpLeg',
    'LeftLeg',
    'RightLeg',
    'LeftArm',
    'RightArm',
    'LeftForeArm',
    'RightForeArm',
  ];
  return {
    root,
    body,
    model,
    rifle,
    flash,
    mixer,
    idle,
    walk,
    arms: ['RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'].map((n) =>
      model.getObjectByName(n),
    ),
    joints: names.map((name) => ({
      name,
      bone: model.getObjectByName(name)!,
      rest: model.getObjectByName(name)!.quaternion.clone(),
    })),
    walkWeight: 0,
    floorLift: 0,
    floorPoints: [
      ['Head', 0.13],
      ['LeftFoot', 0.08],
      ['RightFoot', 0.08],
      ['LeftHand', 0.055],
      ['RightHand', 0.055],
      ['Spine', 0.14],
      ['LeftLeg', 0.09],
      ['RightLeg', 0.09],
      ['LeftArm', 0.075],
      ['RightArm', 0.075],
    ].map(([name, radius]) => ({
      bone: model.getObjectByName(name as string)!,
      radius: radius as number,
    })),
  };
}
void test('actual skinned guard settles near the floor in every fall direction; rifle detaches and stops moving', async () => {
  const source = await sourceModel();
  for (const style of ['front', 'back', 'left', 'right', 'kneel'] as const)
    for (const yaw of [0, 1.4, 2.8]) {
      const scene = new T.Scene(),
        a = rig(source, scene),
        g = createBunker().guards[0];
      g.x = 0;
      g.z = 8;
      g.yaw = yaw;
      g.readiness = 1;
      animateGuard(a, g, 1 / 60, scene, true);
      const beforeHeight = new T.Box3()
        .setFromObject(a.model, true)
        .getSize(new T.Vector3()).y;
      g.health = 0;
      g.fallStyle = style;
      for (let i = 0; i < 130; i++) {
        g.down = Math.min(1, i / 95);
        animateGuard(a, g, 1 / 60, scene, true);
      }
      a.root.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(a.model, true),
        size = bounds.getSize(new T.Vector3());
      assert.ok(
        bounds.min.y > -0.035,
        `${style} at ${yaw} clips floor: ${bounds.min.y}`,
      );
      assert.ok(
        bounds.min.y < 0.16,
        `${style} at ${yaw} floats: ${bounds.min.y}`,
      );
      assert.ok(size.y < 0.85, `${style} must lie down: ${size.y}`);
      assert.equal(a.rifle.parent, scene);
      assert.equal(a.dropped?.settled, true);
      const rifle = new T.Box3().setFromObject(a.rifle);
      assert.ok(Math.abs(rifle.min.y - 0.018) < 0.005);
      const position = a.rifle.position.clone(),
        orientation = a.rifle.quaternion.clone();
      animateGuard(a, g, 0, scene, false);
      assert.deepEqual(a.rifle.position, position);
      assert.ok(a.rifle.quaternion.equals(orientation));
      resetGuardActor(a);
      assert.equal(a.rifle.parent, a.body);
      assert.equal(a.dropped, undefined);
      const fresh = createBunker().guards[0];
      animateGuard(a, fresh, 0, scene, false);
      a.root.updateMatrixWorld(true);
      const standing = new T.Box3()
        .setFromObject(a.model, true)
        .getSize(new T.Vector3());
      assert.ok(
        standing.y > 1.65 && standing.y < 1.95,
        `retry ${style} ${yaw}: ${standing.y} before ${beforeHeight}`,
      );
    }
});
