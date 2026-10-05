import assert from 'node:assert/strict';
import { test } from 'node:test';
import { terrainHeight, roadDistance } from './terrain';
import { village } from './map';
void test('terrain keeps the drivable village and building foundations aligned with collision geometry', () => {
  for (let x = -83; x <= 65; x += 2)
    for (let z = -375; z <= 30; z += 2) {
      if (Math.abs(z + 322) < 17) continue;
      assert.equal(terrainHeight(x, z), -0.08);
    }
  for (const c of village().filter((c) => c.kind === 'house')) {
    for (const x of [c.x - c.w / 2, c.x + c.w / 2])
      for (const z of [c.z - c.d / 2, c.z + c.d / 2])
        assert.equal(terrainHeight(x, z), -0.08);
  }
});
void test('river is recessed beneath water with continuous banks and hills outside combat space', () => {
  assert.ok(terrainHeight(30, -322) < -2);
  assert.equal(terrainHeight(30, -302), -0.08);
  for (let z = -345; z < -300; z += 0.1)
    assert.ok(
      Math.abs(terrainHeight(30, z + 0.1) - terrainHeight(30, z)) < 0.06,
    );
  assert.ok(terrainHeight(150, -160) > 1);
  for (const [x, z] of [
    [0, 18],
    [0, -200],
    [-44, -144],
    [-22, -280],
    [0, -299],
  ])
    assert.ok(roadDistance(x, z) < 0);
  assert.ok(roadDistance(60, -160) > 20);
});
