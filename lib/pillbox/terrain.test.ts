import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { beachHeight, createBeachGeometry, CoastalWater } from './terrain';
import { WreckSmoke } from './smolder';
import { createPillboxBattle } from './simulation';

void test('beach contours keep the bunker level, form craters and slope beneath the surf', () => {
  assert.equal(beachHeight(0, 0), 0);
  assert.ok(beachHeight(10, -31) < -0.35);
  assert.ok(beachHeight(0, -150) < -0.9);
  const geometry = createBeachGeometry();
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i += 113) {
    assert.ok(
      Math.abs(
        positions.getY(i) - beachHeight(positions.getX(i), positions.getZ(i)),
      ) < 0.00001,
    );
  }
  geometry.dispose();
});

void test('coastal water and wreck smoke release resources and reset between battles', () => {
  const scene = new THREE.Scene();
  const water = new CoastalWater(scene);
  const smoke = new WreckSmoke(scene);
  const battle = createPillboxBattle();
  battle.jeeps.push({
    id: 1,
    x: 10,
    z: -38,
    side: 1,
    waypoint: 0,
    health: 0,
    passengers: 0,
    timer: 0,
    phase: 'wreck',
  });
  smoke.update(battle);
  battle.time = 3;
  smoke.update(battle);
  const root = scene.getObjectByName('jeep-smolder-1')!;
  const puff = root.children[0] as THREE.Sprite;
  assert.ok(puff.material.opacity > 0);
  const opacity = puff.material.opacity;
  smoke.update(battle);
  assert.equal(puff.material.opacity, opacity, 'paused battle freezes smoke');
  battle.time = 45;
  smoke.update(battle);
  assert.ok(root.children.every((p) => !p.visible));
  let disposed = false;
  puff.material.addEventListener('dispose', () => {
    disposed = true;
  });
  smoke.update(createPillboxBattle());
  assert.equal(scene.getObjectByName('jeep-smolder-1'), undefined);
  assert.ok(disposed);
  water.dispose();
  smoke.dispose();
  assert.equal(scene.children.length, 0);
});
