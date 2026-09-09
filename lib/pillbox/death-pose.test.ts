import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deathPose } from './death-pose';
void test('four death reactions are distinct, settle and remain deterministic', () => {
  const poses = Array.from({ length: 4 }, (_, id) => deathPose(id, 2));
  assert.equal(new Set(poses.map((p) => JSON.stringify(p))).size, 4);
  for (let id = 0; id < 4; id++) {
    assert.deepEqual(deathPose(id, 2), deathPose(id, 10));
    for (let t = 0; t < 2; t += 0.05)
      assert.ok(Object.values(deathPose(id, t)).every(Number.isFinite));
    assert.equal(deathPose(id, 0).height, 0);
  }
});
