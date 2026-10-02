import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finaleFrame, DETONATION_TIME, FINALE_DURATION } from './cinematic';
void test('demolition establishes the battlefield before destruction, then completes at the end', () => {
  assert.equal(finaleFrame(0).destroyed, 0);
  assert.equal(finaleFrame(DETONATION_TIME - 0.01).shake, 0);
  assert.equal(finaleFrame(DETONATION_TIME + 0.5).complete, false);
  assert.equal(finaleFrame(DETONATION_TIME + 2).destroyed, 1);
  assert.equal(finaleFrame(FINALE_DURATION).complete, true);
});
void test('reduced motion preserves destruction timing without camera movement or shake', () => {
  const normal = finaleFrame(3),
    reduced = finaleFrame(3, true);
  assert.ok(normal.shake > 0);
  assert.ok(normal.zoom > 1);
  assert.equal(reduced.shake, 0);
  assert.equal(reduced.zoom, 1);
  assert.equal(reduced.destroyed, normal.destroyed);
});
