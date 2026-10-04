import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BunkerControls, bindControlRelease } from './controls';
import { bindBunkerInterruptions, bunkerBlurIsInterruption } from './lifecycle';

function fixture(initialTouch = true) {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const controls = new BunkerControls();
  let touch = initialTouch,
    pauses = 0;
  const offControls = bindControlRelease(
    win,
    controls,
    () => {},
    () => bunkerBlurIsInterruption(touch, doc.hidden),
  );
  const offPause = bindBunkerInterruptions(
    win,
    doc,
    () => touch,
    () => {
      pauses++;
      controls.clear();
    },
  );
  const hold = () => {
    controls.begin('move', 1, 0, 0, 'touch');
    controls.move(1, 0, -42);
    controls.begin('turn', 2, 0, 0, 'touch');
    controls.move(2, 42, 0);
    controls.begin('fire', 3, 0, 0, 'touch');
  };
  return {
    win,
    doc,
    controls,
    hold,
    pauses: () => pauses,
    setTouch: (value: boolean) => {
      touch = value;
    },
    dispose: () => {
      offControls();
      offPause();
    },
  };
}
void test('visible mobile blur during multi-touch does not pause or cancel either stick or firing', () => {
  const f = fixture();
  f.hold();
  for (let i = 0; i < 10; i++) f.win.dispatchEvent(new Event('blur'));
  assert.equal(f.pauses(), 0);
  assert.equal(f.controls.axis.y, -1);
  assert.equal(f.controls.turn.x, 1);
  assert.equal(f.controls.firing, true);
  f.win.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId: 3 }));
  assert.equal(f.controls.firing, false);
  assert.equal(f.controls.axis.y, -1);
  f.win.dispatchEvent(
    Object.assign(new Event('pointercancel'), { pointerId: 1 }),
  );
  assert.equal(f.controls.axis.y, 0);
  assert.equal(f.controls.turn.x, 1);
  f.win.dispatchEvent(
    Object.assign(new Event('lostpointercapture'), { pointerId: 2 }),
  );
  assert.equal(f.controls.turn.x, 0);
  f.dispose();
});
void test('backgrounding and leaving mobile still pause and release every held action', () => {
  for (const trigger of ['visibilitychange', 'pagehide', 'hidden-blur']) {
    const f = fixture();
    f.hold();
    if (trigger === 'pagehide') f.win.dispatchEvent(new Event('pagehide'));
    else {
      f.doc.hidden = true;
      (trigger === 'visibilitychange' ? f.doc : f.win).dispatchEvent(
        new Event(trigger === 'hidden-blur' ? 'blur' : trigger),
      );
    }
    assert.equal(f.pauses(), 1, trigger);
    assert.equal(f.controls.firing, false);
    assert.deepEqual(f.controls.axis, { x: 0, y: 0 });
    assert.deepEqual(f.controls.turn, { x: 0, y: 0 });
    f.doc.hidden = false;
    f.doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(f.pauses(), 1);
    f.dispose();
  }
});
void test('desktop blur pauses and the current input layout is consulted after a resize', () => {
  const f = fixture(false);
  f.hold();
  f.win.dispatchEvent(new Event('blur'));
  assert.equal(f.pauses(), 1);
  assert.equal(f.controls.firing, false);
  f.setTouch(true);
  f.hold();
  f.win.dispatchEvent(new Event('blur'));
  assert.equal(f.pauses(), 1);
  assert.equal(f.controls.firing, true);
  f.dispose();
});
void test('unmount removes pause handlers and clears held input', () => {
  const f = fixture(false);
  f.hold();
  f.dispose();
  assert.equal(f.controls.firing, false);
  f.win.dispatchEvent(new Event('blur'));
  f.win.dispatchEvent(new Event('pagehide'));
  f.doc.hidden = true;
  f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.pauses(), 0);
});
