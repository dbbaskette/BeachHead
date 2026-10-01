import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BunkerControls, bindControlRelease } from './controls';
import { createBunker, emptyInput, look, stepBunker } from './simulation';
const event = (name: string, data: Record<string, unknown> = {}) =>
  Object.assign(new Event(name), data);
void test('movement and turning work simultaneously; lifting one finger does not stop the other', () => {
  const c = new BunkerControls(),
    target = new EventTarget(),
    unbind = bindControlRelease(target, c, () => {});
  c.begin('move', 11, 50, 300, 'touch');
  c.move(11, 50, 250);
  c.begin('turn', 22, 780, 300, 'touch');
  c.move(22, 812, 284);
  assert.ok(c.axis.y < -0.9 && c.turn.x > 0.3 && c.turn.y < 0);
  assert.equal(c.firing, false);
  const b = createBunker();
  b.status = 'playing';
  const start = { x: b.x, z: b.z, yaw: b.yaw };
  for (let i = 0; i < 12; i++) {
    look(b, c.turn.x * 0.05 * 650, c.turn.y * 0.05 * 520);
    stepBunker(
      b,
      { ...emptyInput(), forward: -c.axis.y, strafe: c.axis.x },
      0.05,
    );
  }
  assert.ok(Math.hypot(b.x - start.x, b.z - start.z) > 1);
  assert.notEqual(b.yaw, start.yaw);
  target.dispatchEvent(
    event('pointerup', { pointerId: 11, pointerType: 'touch' }),
  );
  assert.deepEqual(c.axis, { x: 0, y: 0 });
  assert.ok(c.turn.x > 0);
  target.dispatchEvent(
    event('pointerup', { pointerId: 22, pointerType: 'touch' }),
  );
  assert.deepEqual(c.turn, { x: 0, y: 0 });
  unbind();
});
void test('page-level touch release stops firing even when the button receives no release', () => {
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const c = new BunkerControls(),
      target = new EventTarget(),
      off = bindControlRelease(target, c, () => {});
    c.begin('fire', 9, 780, 180, 'touch');
    assert.equal(c.firing, true);
    target.dispatchEvent(event(type, { pointerId: 9, pointerType: 'touch' }));
    assert.equal(c.firing, false);
    assert.equal(c.begin('fire', 10, 780, 180, 'touch'), true);
    off();
    assert.equal(c.firing, false);
  }
});
void test('Safari touch-end fallback reconciles each finger using touch IDs, not pointer IDs', () => {
  const c = new BunkerControls(),
    target = new EventTarget(),
    off = bindControlRelease(target, c, () => {});
  c.begin('move', 101, 50, 300, 'touch');
  c.begin('fire', 102, 780, 180, 'touch');
  const left = { identifier: 7, clientX: 50, clientY: 300 },
    right = { identifier: 8, clientX: 780, clientY: 180 };
  target.dispatchEvent(event('touchstart', { touches: [left, right] }));
  c.move(101, 50, 250);
  target.dispatchEvent(event('touchend', { touches: [left] }));
  assert.equal(c.firing, false);
  assert.ok(c.axis.y < 0);
  target.dispatchEvent(event('touchend', { touches: [] }));
  assert.deepEqual(c.axis, { x: 0, y: 0 });
  off();
});
void test('interruptions clear all held controls, fresh fingers recover, and unrelated fingers cannot cancel an owner', () => {
  for (const type of ['blur', 'pagehide', 'orientationchange']) {
    const c = new BunkerControls(),
      target = new EventTarget(),
      off = bindControlRelease(target, c, () => {});
    c.begin('move', 1, 0, 0, 'touch');
    c.move(1, 0, -40);
    c.begin('fire', 2, 0, 0, 'touch');
    c.begin('turn', 3, 0, 0, 'touch');
    c.move(3, 40, 0);
    assert.equal(c.begin('move', 8, 2, 2, 'touch'), false);
    target.dispatchEvent(event('pointerup', { pointerId: 8 }));
    assert.ok(c.axis.y < 0 && c.firing);
    target.dispatchEvent(event(type));
    assert.equal(c.firing, false);
    assert.deepEqual(c.axis, { x: 0, y: 0 });
    assert.deepEqual(c.turn, { x: 0, y: 0 });
    assert.equal(c.begin('move', 4, 0, 0, 'touch'), true);
    off();
  }
});
void test('a valid stationary hold stays active without a timeout; touch cleanup does not cancel mouse fire', () => {
  const c = new BunkerControls(),
    target = new EventTarget(),
    off = bindControlRelease(target, c, () => {});
  c.begin('move', 1, 0, 0, 'touch');
  c.move(1, 0, -42);
  c.begin('look', 2, 100, 100, 'mouse');
  for (let i = 0; i < 1000; i++) assert.ok(c.axis.y < 0 && c.firing);
  target.dispatchEvent(event('touchcancel', { touches: [] }));
  assert.deepEqual(c.axis, { x: 0, y: 0 });
  assert.equal(c.firing, true);
  target.dispatchEvent(event('pointerup', { pointerId: 2 }));
  assert.equal(c.firing, false);
  off();
});
