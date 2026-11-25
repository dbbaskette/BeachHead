import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { batchBunkerScenery } from './static-batches';
import { BunkerMobileLights } from './mobile-lights';

void test('batching preserves world placement and leaves doors, hidden parts and transparent surfaces independent', () => {
  const scene = new T.Scene(),
    parent = new T.Group(),
    moving = new T.Group();
  parent.position.set(2, 1, 3);
  parent.rotation.y = 0.5;
  scene.add(parent, moving);
  const mat = new T.MeshStandardMaterial(),
    geometry = new T.BoxGeometry(1, 1, 1);
  const a = new T.Mesh(geometry, mat),
    b = new T.Mesh(geometry, mat);
  a.position.x = 1;
  b.position.x = 2;
  parent.add(a, b);
  const movable = new T.Mesh(geometry, mat);
  moving.add(movable);
  const hidden = new T.Mesh(geometry, mat);
  hidden.visible = false;
  parent.add(hidden);
  const clear = new T.Mesh(
    geometry,
    new T.MeshStandardMaterial({ transparent: true }),
  );
  parent.add(clear);
  scene.updateMatrixWorld(true);
  const expected = new T.Box3()
    .setFromObject(a)
    .union(new T.Box3().setFromObject(b));
  let disposed = false;
  geometry.addEventListener('dispose', () => {
    disposed = true;
  });
  assert.equal(batchBunkerScenery(scene, [moving]), 1);
  const batch = scene.getObjectByName('Static bunker scenery batch')!;
  assert.ok(
    new T.Box3().setFromObject(batch).min.distanceTo(expected.min) < 1e-6,
  );
  assert.ok(
    new T.Box3().setFromObject(batch).max.distanceTo(expected.max) < 1e-6,
  );
  assert.equal(movable.parent, moving);
  assert.equal(hidden.parent, parent);
  assert.equal(clear.parent, parent);
  assert.equal(
    disposed,
    false,
    'shared geometry remains available to moving objects',
  );
});
void test('batching door hardware retains its local coordinates when the door slides', () => {
  const scene = new T.Scene(),
    door = new T.Group();
  door.position.set(5, 0, -10);
  scene.add(door);
  const mat = new T.MeshStandardMaterial();
  for (const x of [-0.5, 0.5]) {
    const mesh = new T.Mesh(new T.BoxGeometry(0.2, 1, 0.2), mat);
    mesh.position.x = x;
    door.add(mesh);
  }
  scene.updateMatrixWorld(true);
  const before = new T.Box3().setFromObject(door);
  assert.equal(batchBunkerScenery(door, []), 1);
  door.position.x += 3;
  scene.updateMatrixWorld(true);
  const after = new T.Box3().setFromObject(door);
  assert.ok(Math.abs(after.min.x - before.min.x - 3) < 1e-6);
  assert.ok(Math.abs(after.min.z - before.min.z) < 1e-6);
});
void test('mobile lighting keeps a fixed light budget while following the player, without consuming weapon lights', () => {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera();
  scene.add(camera);
  const muzzle = new T.PointLight('#fff', 3);
  camera.add(muzzle);
  for (let i = 0; i < 16; i++) {
    const spot = new T.SpotLight('#ffd7a1', 75, 12);
    spot.position.set(0, 3, -i * 5);
    spot.target.position.set(0, 0, -i * 5);
    scene.add(spot, spot.target);
    const point = new T.PointLight('#ffcf93', 4, 6);
    point.position.copy(spot.position);
    scene.add(point);
  }
  const pool = new BunkerMobileLights(scene, [camera]);
  const active = () => {
    const lights: T.Light[] = [];
    scene.traverseVisible((o) => {
      if (o instanceof T.Light) lights.push(o);
    });
    return lights;
  };
  pool.update(new T.Vector3(0, 1, 0));
  assert.equal(active().length, 9);
  const first = active()
    .filter((o) => o !== muzzle)
    .map((o) => o.position.z);
  pool.update(new T.Vector3(0, 1, -75));
  assert.equal(active().length, 9);
  assert.equal(muzzle.visible, true);
  assert.equal(muzzle.intensity, 3);
  assert.ok(Math.min(...first) > -40);
  assert.ok(
    active()
      .filter((o) => o !== muzzle)
      .every((o) => o.position.z <= -55),
  );
});

void test('desktop light pool scales to 6 spots + 4 points with sticky shadows, distance culling, and smooth fades', () => {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera();
  scene.add(camera);
  for (let i = 0; i < 16; i++) {
    const spot = new T.SpotLight('#ffd7a1', 75, 12);
    spot.position.set(0, 3, -i * 5);
    spot.target.position.set(0, 0, -i * 5);
    spot.castShadow = i < 2;
    scene.add(spot, spot.target);
    const point = new T.PointLight('#ffcf93', 4, 6);
    point.position.copy(spot.position);
    scene.add(point);
  }

  const pool = new BunkerMobileLights(scene, [camera], {
    maxSpots: 6,
    maxPoints: 4,
    maxShadows: 2,
    shadowRange: 20,
  });

  const visibleSpots = () => {
    const out: T.SpotLight[] = [];
    scene.traverseVisible((o) => {
      if (o instanceof T.SpotLight) out.push(o);
    });
    return out;
  };
  const visiblePoints = () => {
    const out: T.PointLight[] = [];
    scene.traverseVisible((o) => {
      if (o instanceof T.PointLight) out.push(o);
    });
    return out;
  };

  pool.update(new T.Vector3(0, 1, 0), 0.05);
  assert.equal(visibleSpots().length, 6);
  assert.equal(visiblePoints().length, 4);
  const firstSpot = visibleSpots()[0];
  assert.ok(
    firstSpot.intensity > 0 && firstSpot.intensity < 75,
    'intensity smoothly ramps up when dt > 0',
  );

  for (let s = 0; s < 12; s++) pool.update(new T.Vector3(0, 1, 0), 0.05);
  const shadowSlots = visibleSpots().filter((s) => s.castShadow);
  assert.equal(shadowSlots.length, 2);

  // Moving slightly so #0 (-0) and #1 (-5) swap distance order keeps both in their sticky slots.
  const prevZeroPos = visibleSpots()[0].position.z;
  const prevOnePos = visibleSpots()[1].position.z;
  pool.update(new T.Vector3(0, 1, -3.5), 0.05);
  assert.equal(visibleSpots()[0].position.z, prevZeroPos);
  assert.equal(visibleSpots()[1].position.z, prevOnePos);

  // Moving outside shadowRange disables spot shadow casting completely.
  pool.update(new T.Vector3(0, 1, -130), 0.05);
  assert.equal(
    visibleSpots().filter((s) => s.castShadow).length,
    0,
    'out-of-range lights stop casting shadows',
  );
});
