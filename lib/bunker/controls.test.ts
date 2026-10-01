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

void test('keyboard independently walks, aims vertically/horizontally and fires; release stops every axis', async () => {
  const { BunkerKeyboard } = await import('./controls');
  const keyboard = new BunkerKeyboard(),
    keys = new Set(['KeyW', 'KeyD', 'ArrowUp', 'ArrowRight', 'Space']);
  const b = createBunker();
  b.status = 'playing';
  b.guards = [];
  const initial = { x: b.x, z: b.z };
  const input = keyboard.read(keys, 0.05);
  assert.equal(input.forward, 1);
  assert.equal(input.strafe, 1);
  stepBunker(b, input, 0.05);
  assert.ok(b.x > initial.x && b.z < initial.z);
  assert.ok(b.pitch > 0 && b.yaw < 0);
  assert.equal(b.ammo, 31);
  keys.clear();
  const released = keyboard.read(keys, 0.05);
  assert.deepEqual(released, emptyInput());
  const stop = { x: b.x, z: b.z, yaw: b.yaw, pitch: b.pitch };
  stepBunker(b, released, 0.05);
  assert.deepEqual({ x: b.x, z: b.z, yaw: b.yaw, pitch: b.pitch }, stop);
  const aimOnly = keyboard.read(new Set(['ArrowUp']), 0.05);
  assert.equal(aimOnly.forward, 0, 'looking up must not walk forward');
});
void test('keyboard aim ramps gently, fine mode stays precise, reversals and reset discard momentum', async () => {
  const { BunkerKeyboard } = await import('./controls');
  const k = new BunkerKeyboard(),
    keys = new Set(['ArrowRight', 'ArrowUp']);
  const first = k.read(keys, 0.05);
  for (let i = 0; i < 10; i++) k.read(keys, 0.05);
  const fast = k.read(keys, 0.05);
  assert.ok(fast.turn > first.turn * 3);
  keys.add('ShiftLeft');
  const fine = k.read(keys, 0.05);
  assert.equal(fine.turn, 0.2);
  assert.equal(fine.aimPitch, 0.2);
  keys.delete('ShiftLeft');
  keys.delete('ArrowRight');
  keys.add('ArrowLeft');
  assert.equal(k.read(keys, 0.05).turn, -first.turn);
  k.clear();
  assert.equal(k.read(new Set(['ArrowRight']), 0.05).turn, first.turn);
  const b = createBunker();
  b.status = 'playing';
  b.guards = [];
  for (let i = 0; i < 100; i++)
    stepBunker(b, k.read(new Set(['ArrowUp']), 0.05), 0.05);
  assert.equal(b.pitch, 0.95);
});
