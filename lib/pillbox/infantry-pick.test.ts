import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { intersectInfantryHitbox } from './infantry';

function rayAt(targetX: number, targetY: number, targetZ: number) {
  const origin = new THREE.Vector3(targetX, targetY, targetZ + 12);
  const direction = new THREE.Vector3(0, 0, -1);
  return new THREE.Ray(origin, direction);
}

void test('intersectInfantryHitbox matches pose heights, handles rotated crawl bounds, and rejects down/misses', () => {
  const x = 12;
  const y = 1.5;
  const z = -20;

  // Center mass hits standing/crouching poses.
  for (const pose of ['run', 'cover', 'dugout'] as const) {
    const dist = intersectInfantryHitbox(
      rayAt(x, y + 0.8, z),
      x,
      y,
      z,
      0,
      pose,
    );
    assert.ok(dist !== null && Number.isFinite(dist) && dist > 0);
  }

  // Head height (2.1m above floor) hits upright run pose, misses crouched cover/dugout/crawl.
  assert.ok(intersectInfantryHitbox(rayAt(x, y + 2.1, z), x, y, z, 0, 'run'));
  assert.equal(
    intersectInfantryHitbox(rayAt(x, y + 2.1, z), x, y, z, 0, 'cover'),
    null,
  );
  assert.equal(
    intersectInfantryHitbox(rayAt(x, y + 2.1, z), x, y, z, 0, 'dugout'),
    null,
  );
  assert.equal(
    intersectInfantryHitbox(rayAt(x, y + 2.1, z), x, y, z, 0, 'crawl'),
    null,
  );

  // Downed soldiers are never pickable and off-target rays miss.
  assert.equal(
    intersectInfantryHitbox(rayAt(x, y + 0.8, z), x, y, z, 0, 'down'),
    null,
  );
  assert.equal(
    intersectInfantryHitbox(rayAt(x + 3, y + 0.8, z), x, y, z, 0, 'run'),
    null,
  );

  // Rotated prone crawl hitbox matches Three.js Y-axis rotation into world space.
  const dummy = new THREE.Object3D();
  dummy.position.set(x, y, z);
  dummy.rotation.y = Math.PI / 2;
  dummy.updateMatrixWorld();
  const tailWorld = new THREE.Vector3(0, 0.35, -0.95).applyMatrix4(
    dummy.matrixWorld,
  );
  const lateralWorld = new THREE.Vector3(0.85, 0.35, 0).applyMatrix4(
    dummy.matrixWorld,
  );
  const downRay = (wx: number, wz: number) =>
    new THREE.Ray(
      new THREE.Vector3(wx, y + 5, wz),
      new THREE.Vector3(0, -1, 0),
    );

  assert.ok(
    intersectInfantryHitbox(
      downRay(tailWorld.x, tailWorld.z),
      x,
      y,
      z,
      Math.PI / 2,
      'crawl',
    ) !== null,
  );
  assert.equal(
    intersectInfantryHitbox(
      downRay(lateralWorld.x, lateralWorld.z),
      x,
      y,
      z,
      Math.PI / 2,
      'crawl',
    ),
    null,
  );
});
