import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler, Vector3 } from 'three';
import { createBunker } from './simulation';
import { guardReaction } from './reactions';
void test('collapses settle horizontally at every facing, while wounds produce distinct bounded reactions', () => {
  const g = createBunker().guards[0];
  g.health = 0;
  g.down = 1;
  for (const region of ['head', 'torso', 'leg'] as const)
    for (const id of [0, 1])
      for (const yaw of [0, 1, 2, 3]) {
        g.hitRegion = region;
        g.id = id;
        const pose = guardReaction(g);
        const head = new Vector3(0, 1.8, 0).applyEuler(
          new Euler(pose.pitch, yaw, pose.roll, 'YXZ'),
        );
        head.y += pose.height;
        assert.ok(
          head.y > 0.1 && head.y < 0.4,
          `${region} settles rather than standing or floating at yaw ${yaw}`,
        );
      }
  g.health = 100;
  g.hitTime = 0.16;
  g.hitRegion = 'leg';
  assert.ok(guardReaction(g).knees > 0);
  g.hitTime = 0;
  assert.equal(guardReaction(g).knees, 0);
  assert.equal(guardReaction(g).pitch, 0);
});
