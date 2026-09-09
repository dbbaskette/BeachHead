import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mouseAimDelta, mouseWheelRange } from './mouse-aim';
void test('mouse aim preserves fractional corrections and slows in optics and precision mode', () => {
  const normal = mouseAimDelta(1, 1);
  assert.ok(normal.heading < 0.05 && normal.range > -1);
  const fine = mouseAimDelta(1, 1, true, true);
  assert.ok(fine.heading > 0 && fine.heading < normal.heading / 10);
  assert.ok(Math.abs(fine.range) < Math.abs(normal.range) / 10);
  assert.equal(mouseWheelRange(100, 0, true), -2.5);
  assert.equal(mouseWheelRange(1, 1), mouseWheelRange(16, 0));
});
