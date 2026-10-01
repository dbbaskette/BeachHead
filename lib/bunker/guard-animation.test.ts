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
  };
}
void test('actual skinned guard settles near the floor in different impacts and facings; rifle detaches and stops moving', async () => {
  const source = await sourceModel();
  for (const action of ['reel', 'spin', 'sprawl', 'fold', 'kneel'] as const)
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
      g.deathAction = action;
      g.hitPoint = { x: g.x, y: 1.35, z: g.z };
      g.hitDirection = { x: Math.sin(yaw), z: Math.cos(yaw) };
      for (let i = 0; i < 300; i++) {
        g.down = Math.min(1, i / 95);
        animateGuard(a, g, 1 / 60, scene, true);
        if (i % 30 === 0) {
          const movingBounds = new T.Box3().setFromObject(a.model, true);
          assert.ok(
            movingBounds.min.y > -0.06 && movingBounds.min.y < 0.16,
            `${action} at progress ${g.down}: support height ${movingBounds.min.y}`,
          );
        }
      }
      a.root.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(a.model, true),
        size = bounds.getSize(new T.Vector3());
      assert.ok(
        bounds.min.y > -0.035,
        `${action} at ${yaw} clips floor: ${bounds.min.y}`,
      );
      assert.ok(
        bounds.min.y < 0.16,
        `${action} at ${yaw} floats: ${bounds.min.y}`,
      );
      assert.ok(size.y < 0.85, `${action} must lie down: ${size.y}`);
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
        `retry ${yaw}: ${standing.y} before ${beforeHeight}`,
      );
    }
});

void test('collapse bends independent joints, preserves the root, sleeps and responds to another bullet without restarting', async () => {
  const source = await sourceModel(),
    scene = new T.Scene(),
    a = rig(source, scene),
    g = createBunker().guards[0];
  g.x = 0;
  g.z = 8;
  g.yaw = 0;
  g.hitDirection = { x: 0, z: 1 };
  g.hitPoint = { x: 0, y: 1.3, z: 8 };
  animateGuard(a, g, 0, scene, true);
  const root = a.root.quaternion.clone();
  const knee = a.model.getObjectByName('LeftLeg')!.quaternion.clone();
  const arm = a.model.getObjectByName('LeftForeArm')!.quaternion.clone();
  g.health = 0;
  for (let i = 0; i < 30; i++) animateGuard(a, g, 1 / 60, scene, true);
  assert.ok(
    a.root.quaternion.equals(root),
    'the whole model must not be tipped over',
  );
  assert.ok(a.model.getObjectByName('LeftLeg')!.quaternion.angleTo(knee) > 0.2);
  assert.ok(
    a.model.getObjectByName('LeftForeArm')!.quaternion.angleTo(arm) > 0.2,
  );
  for (let i = 0; i < 360; i++) animateGuard(a, g, 1 / 60, scene, true);
  assert.equal(a.ragdoll!.sleeping, true);
  const chest = a.ragdoll!.nodes.find((n) => n.name === 'Spine2')!;
  const before = chest.p.clone(),
    age = a.ragdoll!.age;
  g.hitPoint = { x: chest.p.x, y: chest.p.y, z: chest.p.z };
  g.hitDirection = { x: 1, z: 0 };
  g.hits++;
  animateGuard(a, g, 1 / 60, scene, true);
  assert.equal(a.ragdoll!.sleeping, false);
  assert.ok(a.ragdoll!.age >= age);
  assert.ok(chest.p.distanceTo(before) > 0.0001);
  const frozen = a.ragdoll!.nodes.map((n) => n.p.clone());
  animateGuard(a, g, 0, scene, false);
  assert.deepEqual(
    a.ragdoll!.nodes.map((n) => n.p),
    frozen,
  );
});
void test('physical response agrees at 30/60/120 fps and body contacts cannot pass through a nearby wall', async () => {
  const source = await sourceModel(),
    results: T.Vector3[][] = [];
  for (const fps of [30, 60, 120]) {
    const scene = new T.Scene(),
      a = rig(source, scene),
      g = createBunker().guards[0];
    g.x = 6.25;
    g.z = 10;
    g.yaw = 0;
    animateGuard(a, g, 0, scene, true);
    g.health = 0;
    g.hitDirection = { x: 1, z: 0 };
    g.hitPoint = { x: g.x, y: 1.4, z: g.z };
    for (let i = 0; i < fps * 4; i++) {
      animateGuard(a, g, 1 / fps, scene, true);
      for (const n of a.ragdoll!.nodes)
        assert.ok(n.p.x + n.radius <= 6.751, `${n.name} penetrates wall`);
    }
    results.push(a.ragdoll!.nodes.map((n) => n.p.clone()));
  }
  for (const r of results.slice(1))
    r.forEach((p, i) =>
      assert.ok(
        p.distanceTo(results[0][i]) < 0.001,
        'fixed-step response changed with frame rate',
      ),
    );
});
void test('blast launches an articulated body into cover without tunneling or losing limb constraints', async () => {
  const source = await sourceModel(),
    scene = new T.Scene(),
    a = rig(source, scene),
    b = createBunker(),
    g = b.guards[0];
  g.x = 0;
  g.z = -22.8;
  g.yaw = 0;
  animateGuard(a, g, 0, scene, true);
  g.health = 0;
  g.deathAction = 'sprawl';
  g.hitPoint = { x: 0, y: 1, z: g.z };
  g.hitDirection = { x: 0, z: -1 };
  g.hitPower = 6;
  g.hitLift = 2.8;
  const { worldSolids } = await import('./simulation');
  let wallContact = false,
    airborne = false;
  for (let i = 0; i < 360; i++) {
    animateGuard(a, g, 1 / 60, scene, true, worldSolids(b));
    const nodes = a.ragdoll!.nodes;
    airborne ||= nodes.every((n) => n.p.y > n.radius + 0.03);
    wallContact ||= !!a.ragdoll!.wallImpact;
    for (const n of nodes) {
      assert.ok(Number.isFinite(n.p.x + n.p.y + n.p.z));
      assert.ok(
        n.p.z - n.radius >= -23.911,
        `${n.name} crossed closed steel door`,
      );
      assert.ok(n.p.y >= n.radius + 0.011, `${n.name} crossed floor`);
    }
  }
  assert.ok(airborne, 'strong blast lifts the whole body briefly');
  assert.ok(wallContact, 'torso contacts door');
  assert.ok(
    new T.Box3().setFromObject(a.model, true).getSize(new T.Vector3()).y < 0.9,
    'body settles after impact',
  );
});
void test('three fall models have different loss-of-support trajectories on the actual soldier', async () => {
  const source = await sourceModel();
  const poses: { hip: T.Vector3; lean: T.Vector3 }[] = [];
  for (const action of ['reel', 'kneel', 'spin'] as const) {
    const scene = new T.Scene(),
      a = rig(source, scene),
      g = createBunker().guards[0];
    g.x = 0;
    g.z = 8;
    g.yaw = Math.PI;
    g.hitDirection = { x: 0, z: -1 };
    g.hitSide = 0.5;
    animateGuard(a, g, 0, scene, true);
    g.health = 0;
    g.deathAction = action;
    for (let i = 0; i < 36; i++) animateGuard(a, g, 1 / 60, scene, true);
    const nodes = a.ragdoll!.nodes,
      hip = nodes.find((n) => n.name === 'Hips')!.p,
      chest = nodes.find((n) => n.name === 'Spine2')!.p;
    poses.push({ hip: hip.clone(), lean: chest.clone().sub(hip) });
  }
  assert.ok(
    poses[1].hip.y < poses[0].hip.y - 0.15,
    'buckling loses height before a backward stumble',
  );
  assert.ok(
    poses[0].lean.z < -0.2,
    'backward stumble carries the chest behind the hips',
  );
  assert.ok(
    Math.abs(poses[2].lean.x) > Math.abs(poses[0].lean.x) + 0.1,
    'side collapse leads laterally',
  );
});
void test('ribcage width and trunk length survive floor contact, bursts and a blast without folding into a noodle', async () => {
  const source = await sourceModel();
  for (const action of ['reel', 'kneel', 'spin'] as const) {
    const scene = new T.Scene(),
      a = rig(source, scene),
      g = createBunker().guards[0];
    g.x = 0;
    g.z = 8;
    g.yaw = Math.PI;
    g.hitDirection = { x: 0, z: -1 };
    animateGuard(a, g, 0, scene, true);
    g.health = 0;
    g.deathAction = action;
    animateGuard(a, g, 0, scene, true);
    const get = (name: string) =>
      a.ragdoll!.nodes.find((n) => n.name === name)!;
    const width = get('LeftArm').p.distanceTo(get('RightArm').p),
      length = get('Hips').p.distanceTo(get('Spine2').p);
    for (let i = 0; i < 300; i++) {
      if (i === 12 || i === 22 || i === 110) {
        g.hitPoint = {
          x: get('Spine2').p.x,
          y: get('Spine2').p.y,
          z: get('Spine2').p.z,
        };
        g.hits++;
        if (i === 110) {
          g.hitPower = 4;
          g.hitLift = 1.5;
        }
      }
      animateGuard(a, g, 1 / 60, scene, true);
      const w = get('LeftArm').p.distanceTo(get('RightArm').p) / width,
        l = get('Hips').p.distanceTo(get('Spine2').p) / length;
      assert.ok(w > 0.94 && w < 1.06, `${action}: ribcage width ${w}`);
      assert.ok(l > 0.88 && l < 1.07, `${action}: trunk length ${l}`);
    }
  }
});
