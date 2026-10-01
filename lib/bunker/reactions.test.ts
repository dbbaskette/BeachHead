import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBunker } from './simulation';
import { guardReaction } from './reactions';
import { GuardHitSpring } from './ragdoll';
void test('live leg wounds briefly buckle support and recover', () => {
  const g = createBunker().guards[0];
  g.hitTime = 0.16;
  g.hitRegion = 'leg';
  assert.ok(guardReaction(g).knees > 0);
  g.hitTime = 0;
  assert.equal(guardReaction(g).knees, 0);
});
void test('rapid bullet kicks accumulate without snapping the live pose back to neutral', () => {
  const g = createBunker().guards[0];
  g.yaw = 0;
  g.hitDirection = { x: 0, z: 1 };
  g.hitSide = 0.4;
  const spring = new GuardHitSpring();
  spring.kick(g);
  for (let i = 0; i < 8; i++) spring.update(1 / 60);
  const before = spring.angle.clone(),
    speed = spring.velocity.length();
  spring.kick(g);
  assert.deepEqual(
    spring.angle,
    before,
    'a new hit must preserve the current pose',
  );
  assert.ok(spring.velocity.length() > speed);
  spring.update(1 / 60);
  assert.ok(spring.angle.length() > 0.01);
  const paused = spring.angle.clone();
  spring.update(0);
  assert.deepEqual(spring.angle, paused);
  for (let i = 0; i < 300; i++) spring.update(1 / 60);
  assert.ok(spring.angle.length() < 0.001);
});
