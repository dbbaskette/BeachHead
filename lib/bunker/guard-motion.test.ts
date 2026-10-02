import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { GuardMotion } from './guard-motion';
import {
  animateGuard,
  resetGuardActor,
  type GuardActor,
} from './guard-animation';
import { createBunker, shootBunker } from './simulation';
import { guardClips } from './uniform';
import { PELVIS_HEIGHT } from './reactions';
async function fixture() {
  const data = await readFile(
    new URL('../../public/models/bunker/ww2-soldier.glb', import.meta.url),
  );
  const source = (
    await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      '',
    )
  ).scene;
  const motion = JSON.parse(
    await readFile(
      new URL('../../public/models/bunker/guard-motions.json', import.meta.url),
      'utf8',
    ),
  );
  const clips: T.AnimationClip[] = motion.clips.map(
    (c: Parameters<typeof T.AnimationClip.parse>[0]) =>
      T.AnimationClip.parse(c),
  );
  const scene = new T.Scene(),
    root = new T.Group(),
    body = new T.Group(),
    model = clone(source);
  const bounds = new T.Box3().setFromObject(model);
  model.scale.setScalar(1.8 / (bounds.max.y - bounds.min.y));
  model.position.y = -bounds.min.y * model.scale.y;
  model.rotation.y = Math.PI;
  body.position.y = -PELVIS_HEIGHT;
  body.add(model);
  root.add(body);
  scene.add(root);
  const rifle = new T.Group(),
    flash = new T.Mesh();
  rifle.add(flash);
  body.add(rifle);
  const mixer = new T.AnimationMixer(model),
    [idleClip, walkClip] = guardClips(model);
  const a: GuardActor = {
    root,
    body,
    model,
    rifle,
    flash,
    mixer,
    idle: mixer.clipAction(idleClip),
    walk: mixer.clipAction(walkClip),
    arms: [],
    joints: [],
    walkWeight: 0,
  };
  a.motion = new GuardMotion(a, clips);
  const g = createBunker().guards[0];
  Object.assign(g, { x: 0, z: 0, yaw: Math.PI, readiness: 1 });
  return { a, g, scene, clips };
}
void test('authored guard motions cover rifle locomotion, turns, aim and four falls', async () => {
  const { clips } = await fixture();
  for (const name of [
    'idle',
    'idle aiming',
    'walk forward',
    'walk backward',
    'walk left',
    'walk right',
    'turn 90 left',
    'turn 90 right',
    'death from the front',
    'death from right',
    'death from the back',
    'death from front headshot',
  ]) {
    const clip = clips.find((c) => c.name === name);
    assert.ok(clip, name);
    assert.ok(clip.duration > 0.5 && clip.duration < 5);
    for (const track of clip.tracks) {
      assert.ok(Array.from(track.values).every(Number.isFinite));
      assert.ok(
        track.name.endsWith('.quaternion') || track.name === 'Hips.position',
        'only the root translates',
      );
    }
  }
});
void test('authored falls stay human-sized, hold their landing, pause, and reset to a standing guard', async () => {
  for (const action of ['reel', 'kneel', 'spin', 'fold'] as const) {
    const { a, g, scene } = await fixture();
    for (let i = 0; i < 30; i++) animateGuard(a, g, 1 / 60, scene, true, []);
    const standingBefore = new T.Box3()
      .setFromObject(a.model, true)
      .getSize(new T.Vector3()).y;
    g.health = 0;
    g.deathAction = action;
    const offsets = new Map<string, T.Vector3>();
    a.model.traverse((o) => {
      if (o instanceof T.Bone && o.name !== 'Hips')
        offsets.set(o.name, o.position.clone());
    });
    for (let i = 0; i < 330; i++) {
      animateGuard(a, g, 1 / 60, scene, true, []);
      if (i % 20 === 0) {
        const bounds = new T.Box3().setFromObject(a.model, true),
          size = bounds.getSize(new T.Vector3());
        assert.ok(
          bounds.min.y > -0.1,
          `${action}: floor penetration ${bounds.min.y}`,
        );
        assert.ok(
          Math.max(size.x, size.y, size.z) < 2.6,
          `${action}: distorted skin`,
        );
        for (const [name, p] of offsets)
          assert.ok(
            a.model.getObjectByName(name)!.position.distanceTo(p) < 1e-7,
          );
      }
    }
    const final = new T.Box3().setFromObject(a.model, true);
    assert.ok(
      final.max.y < 1,
      `${action}: must finish lying down (${final.max.y})`,
    );
    const before = g.bodyTargets!.map((p) => ({ ...p }));
    animateGuard(a, g, 0, scene, false, []);
    assert.deepEqual(g.bodyTargets, before);
    for (let i = 0; i < 60; i++) animateGuard(a, g, 1 / 60, scene, true, []);
    for (let i = 0; i < before.length; i++)
      assert.ok(
        Math.abs(g.bodyTargets![i].x - before[i].x) < 1e-6,
        'landing must not restart or writhe',
      );
    resetGuardActor(a);
    g.health = 100;
    g.hits = 0;
    animateGuard(a, g, 1 / 60, scene, true, []);
    const standing = new T.Box3()
      .setFromObject(a.model, true)
      .getSize(new T.Vector3());
    assert.ok(
      standing.y > 1.2 &&
        standing.y < 2 &&
        Math.abs(standing.y - standingBefore) < 0.1,
      `reset height ${standing.y}, before ${standingBefore}`,
    );
  }
});

void test('aimed rifle and live hit volumes follow the retargeted pose, including a lowered head', async () => {
  const { a, g, scene } = await fixture();
  for (let i = 0; i < 60; i++) animateGuard(a, g, 1 / 60, scene, true, []);
  const barrel = new T.Vector3(0, 0, -1).applyQuaternion(
    a.rifle.getWorldQuaternion(new T.Quaternion()),
  );
  assert.ok(
    barrel.dot(new T.Vector3(-Math.sin(g.yaw), 0, -Math.cos(g.yaw))) > 0.95,
    'rifle must aim in the gameplay firing direction',
  );
  const head = g.bodyTargets!.find((t) => t.region === 'head')!;
  assert.ok(
    head.y < 1.45,
    'this rifle stance lowers the head below the old fixed hitbox',
  );
  const b = createBunker();
  b.status = 'playing';
  b.guards = [g];
  b.x = 0;
  b.z = 4;
  const aim = (y: number) => {
    b.yaw = Math.atan2(-(head.x - b.x), -(head.z - b.z));
    b.pitch = Math.atan2(y - 1.65, Math.hypot(head.x - b.x, head.z - b.z));
    b.cooldown = 0;
  };
  aim(head.y + 0.6);
  shootBunker(b);
  assert.equal(g.health, 100, 'empty space above the posed head must miss');
  aim(head.y);
  shootBunker(b);
  assert.equal(g.health, 25);
  assert.equal(g.hitRegion, 'head');
});
