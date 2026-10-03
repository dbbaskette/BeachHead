import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  finaleFrame,
  debrisFrame,
  DETONATION_TIME,
  FINALE_DURATION,
} from './cinematic';
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
void test('the blast grows, clears to rubble, and leaves time for the dust to settle', () => {
  assert.equal(finaleFrame(DETONATION_TIME - 0.1).peak, 0);
  assert.ok(finaleFrame(DETONATION_TIME + 0.3).peak > 0.9);
  assert.equal(finaleFrame(DETONATION_TIME + 2).peak, 0);
  let previous = 0;
  for (let t = 0; t <= FINALE_DURATION; t += 1 / 60) {
    const frame = finaleFrame(t);
    assert.ok(frame.destroyed >= previous);
    assert.ok(frame.peak >= 0 && frame.peak <= 1);
    previous = frame.destroyed;
  }
});
void test('concrete rises, falls under gravity and stops at the beach with an impact age', () => {
  for (let i = 0; i < 110; i++) {
    assert.ok(debrisFrame(i, -0.1).age < 0);
    const early = debrisFrame(i, 0.4);
    assert.ok(early.y < 0.3);
    const dt = 0.02;
    const a = debrisFrame(i, 1),
      b = debrisFrame(i, 1 + dt),
      c = debrisFrame(i, 1 + 2 * dt);
    assert.ok(Math.abs((c.y - 2 * b.y + a.y) / (dt * dt) - 0.115) < 1e-9);
    const landed = debrisFrame(i, 5);
    assert.ok(Math.abs(landed.y - 0.468) < 1e-10);
    assert.ok(landed.impactAge > 0);
    assert.equal(debrisFrame(i, 6).x, landed.x);
    // No accumulated state: scrubbing backwards reproduces the same trajectory.
    assert.deepEqual(debrisFrame(i, 0.4), early);
  }
});
