import test from 'node:test';
import assert from 'node:assert/strict';
import { thumbAxis, TouchDrag, mobilePixelRatio } from '../touch-input';
import { mouseAimDelta } from './mouse-aim';
import { createBattle, setAim } from './simulation';

void test('thumb aim has a stable center, fine adjustment and a bounded diagonal', () => {
  assert.deepEqual(thumbAxis(0, 0), { x: 0, y: 0 });
  assert.deepEqual(thumbAxis(3, 2), { x: 0, y: 0 });
  assert.ok(thumbAxis(12, 0).x > 0);
  assert.ok(thumbAxis(12, 0).x < 0.1);
  assert.deepEqual(thumbAxis(100, 0), { x: 1, y: 0 });
  const diagonal = thumbAxis(-100, -100);
  assert.ok(diagonal.x < 0 && diagonal.y < 0);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-10);
});

void test('a second finger cannot steal, move or release the aiming gesture', () => {
  const drag = new TouchDrag();
  assert.equal(drag.begin(1, 120, 200), true);
  assert.equal(drag.begin(2, 300, 700), false);
  assert.equal(drag.move(2, 350, 650), null);
  assert.equal(drag.end(2), false);
  assert.deepEqual(drag.move(1, 126, 197), { x: 6, y: -3 });
  assert.deepEqual(drag.move(1, 128, 194), { x: 2, y: -3 });
  assert.equal(drag.end(1), true);
  assert.equal(drag.move(1, 200, 300), null);
  assert.equal(drag.begin(2, 300, 700), true);
  drag.clear();
  assert.equal(drag.move(2, 305, 705), null);
});

void test('continuous thumb aim gives equivalent range at 30 and 60 fps and respects gun limits', () => {
  const steer = (fps: number) => {
    const battle = createBattle();
    for (let i = 0; i < fps; i++) {
      const delta = mouseAimDelta(
        600 / fps,
        -40 / fps,
        false,
        false,
        battle.range,
      );
      setAim(
        battle,
        battle.heading + delta.heading,
        battle.range + delta.range,
      );
    }
    return battle;
  };
  const a = steer(30),
    b = steer(60);
  assert.ok(Math.abs(a.range - b.range) < 1e-7);
  assert.ok(Math.abs(a.heading - b.heading) < 1e-7);
  assert.ok(a.range <= 1600 && a.heading <= 55);
});

void test('mobile rendering caps high density screens without upscaling low density screens', () => {
  assert.equal(mobilePixelRatio(3, true), 1.25);
  assert.equal(mobilePixelRatio(3, false), 1.75);
  assert.equal(mobilePixelRatio(1, true), 1);
});
