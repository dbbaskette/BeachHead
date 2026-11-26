import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shallowEqual } from './hud-utils';

void test('shallowEqual compares plain HUD snapshots using Object.is', () => {
  const base = {
    status: 'playing',
    health: 100,
    score: 250,
    zoom: false,
    timer: 0,
  };
  assert.equal(shallowEqual(base, base), true);
  assert.equal(shallowEqual(base, { ...base }), true);
  assert.equal(shallowEqual(base, { ...base, score: 300 }), false);
  assert.equal(
    shallowEqual(base as Record<string, unknown>, { ...base, extra: 1 }),
    false,
  );
  assert.equal(
    shallowEqual({ value: Number.NaN }, { value: Number.NaN }),
    true,
  );
  assert.equal(shallowEqual({ value: 0 }, { value: -0 }), false);
});
