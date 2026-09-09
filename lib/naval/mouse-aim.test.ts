import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mouseAimDelta, mouseWheelRange } from './mouse-aim';
void test('mouse aim keeps fine horizontal corrections and usable vertical adjustments', () => {
  const normal = mouseAimDelta(1, 1);
  assert.ok(normal.heading < 0.05 && normal.range < -3);
  const fine = mouseAimDelta(1, 1, true, true);
  assert.ok(fine.heading > 0 && fine.heading < normal.heading / 10);
  assert.ok(Math.abs(fine.range) < Math.abs(normal.range));
  assert.ok(Math.abs(fine.range) > 1);
  assert.equal(mouseWheelRange(100, 0, true), -6);
  assert.equal(mouseWheelRange(1, 1), mouseWheelRange(16, 0));
});
void test('vertical aiming compensates for distance and stays within firing range', () => {
  assert.ok(
    Math.abs(mouseAimDelta(0, 1, false, false, 1400).range) >
      Math.abs(mouseAimDelta(0, 1, false, false, 400).range) * 8,
  );
  assert.equal(820 + mouseAimDelta(0, -10000).range, 1600);
  assert.equal(820 + mouseAimDelta(0, 10000).range, 250);
  assert.equal(mouseAimDelta(0, 0).range, 0);
  const oneEvent = 820 + mouseAimDelta(0, 20).range;
  let manyEvents = 820;
  for (let i = 0; i < 20; i++)
    manyEvents += mouseAimDelta(0, 1, false, false, manyEvents).range;
  assert.ok(Math.abs(oneEvent - manyEvents) < 1e-8);
});
