import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlakControls } from './controls';
import { bindControlRelease } from '../bunker/controls';
import { createFlak, stepFlak } from './simulation';
void test('a quick fire tap between frames fires once and cannot stick', () => {
  const controls = new FlakControls(),
    state = createFlak();
  state.status = 'playing';
  controls.begin('fire', 7, 700, 300, 'touch');
  controls.end(7);
  stepFlak(state, 1 / 60, controls.takeFire());
  assert.equal(state.fired, 1);
  for (let i = 0; i < 60; i++) stepFlak(state, 1 / 60, controls.takeFire());
  assert.equal(state.fired, 1);
});
void test('aim and fire fingers are independent and global cancel releases the matching owner', () => {
  const c = new FlakControls(),
    target = new EventTarget(),
    unbind = bindControlRelease(target, c, () => {});
  c.begin('turn', 1, 40, 300, 'touch');
  c.move(1, 65, 280);
  c.begin('fire', 2, 700, 300, 'touch');
  assert.equal(c.takeFire(), true);
  assert.ok(c.turn.x > 0);
  const release = new Event('pointercancel');
  Object.defineProperty(release, 'pointerId', { value: 2 });
  target.dispatchEvent(release);
  assert.equal(c.takeFire(), false);
  assert.ok(c.turn.x > 0);
  target.dispatchEvent(new Event('blur'));
  assert.deepEqual(c.turn, { x: 0, y: 0 });
  assert.equal(c.takeFire(), false);
  unbind();
});
void test('pause clears both held firing and any buffered tap', () => {
  const c = new FlakControls();
  c.begin('fire', 1, 0, 0, 'touch');
  c.clear();
  assert.equal(c.takeFire(), false);
  c.queueShot();
  c.clear();
  assert.equal(c.takeFire(), false);
});
