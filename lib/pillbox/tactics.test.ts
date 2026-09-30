import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { aimPillbox, createPillboxBattle, stepPillbox } from './simulation';
import { SMOKE_FLIGHT, SMOKE_LIFETIME } from './types';
import { AssaultSmoke } from './assault-smoke';
import { BEACH_OBSTACLES, clearSegment, infantryRoute } from './navigation';
import { FOXHOLES } from './foxholes';
import { FoxholeDetail } from './foxhole-detail';
import { beachHeight } from './terrain';

function landedSquad() {
  const b = createPillboxBattle();
  b.status = 'playing';
  b.jeepSpawned = 1;
  b.landingCraft.forEach((c) => (c.gunnerHealth = 0));
  for (let i = 0; i < 400 && b.soldiers.length < 3; i++)
    stepPillbox(b, 0.025, false);
  assert.equal(b.soldiers.length, 3);
  b.spawnTimer = 1000;
  return b;
}

void test('early smoke throw can be stopped before release; dead soldiers never throw', () => {
  const b = landedSquad();
  const s = b.soldiers[0];
  delete s.landingCraftId;
  s.z = -120;
  stepPillbox(b, 0.5, false);
  assert.equal(s.smokeState, 'windup');
  assert.equal(b.smoke.length, 0);
  aimPillbox(b, s.x, s.z);
  stepPillbox(b, 0.01, true);
  assert.equal(s.phase, 'down');
  stepPillbox(b, 2, false);
  assert.equal(b.smoke.length, 0);
});

void test('released smoke persists after a kill, freezes on pause, permits hits and expires', () => {
  const b = landedSquad();
  const s = b.soldiers[0];
  delete s.landingCraftId;
  s.z = -120;
  stepPillbox(b, 1.1, false);
  assert.equal(s.smokeState, 'spent');
  assert.equal(b.smoke.length, 1);
  assert.equal(b.smoke[0].targetZ, -110);
  assert.equal(b.smoke[0].age, 0);
  // Keep the subject in the fully developed cloud, with a harmless stationary route.
  s.x = b.smoke[0].targetX;
  s.z = b.smoke[0].targetZ;
  s.speed = 0;
  stepPillbox(b, SMOKE_FLIGHT + 2, false);
  b.status = 'paused';
  const before = structuredClone(b);
  stepPillbox(b, 10, true);
  assert.deepEqual(b, before);
  b.status = 'playing';
  aimPillbox(b, s.x, s.z);
  stepPillbox(b, 0.01, true);
  assert.equal(s.phase, 'down');
  assert.equal(b.smoke.length, 1);
  b.soldiers = [];
  stepPillbox(b, SMOKE_LIFETIME, false);
  assert.equal(b.smoke.length, 0);
  assert.equal(b.health, 100);
  assert.equal(createPillboxBattle().smoke.length, 0);
});

void test('selected infantry crawl behind barricades, stay protected, then stand clear of cover', () => {
  const b = landedSquad();
  const s = b.soldiers[2];
  assert.equal(s.id, 3);
  b.soldiers = [s];
  let sawCrawl = false,
    sawCover = false,
    stood = false;
  for (let i = 0; i < 1800 && !stood; i++) {
    const before = { x: s.x, z: s.z };
    stepPillbox(b, 0.025, false);
    if (s.crawling) {
      sawCrawl = true;
      assert.ok(
        Math.hypot(s.x - before.x, s.z - before.z) <=
          s.speed * 0.6 * 0.025 + 1e-6,
      );
    }
    for (const o of BEACH_OBSTACLES)
      assert.ok(
        Math.abs(s.x - o.x) >= o.halfX + 0.69 ||
          Math.abs(s.z - o.z) >= o.halfZ + 0.69,
      );
    if (s.phase === 'cover' && !sawCover) {
      sawCover = true;
      assert.equal(s.crawling, true);
      s.suppression = 1;
      aimPillbox(b, s.x, s.z);
      stepPillbox(b, 0.001, true);
      assert.equal(s.health, 1);
      assert.match(b.message, /cover/i);
    }
    stood = sawCover && !s.crawling && s.z > -83;
  }
  assert.ok(sawCrawl && sawCover && stood);
});

void test('smoke grows after landing, clears on reset and disposes owned resources', () => {
  const scene = new THREE.Scene();
  const smoke = new AssaultSmoke(scene);
  const b = createPillboxBattle();
  b.smoke.push({ id: 1, x: 18, z: -120, targetX: 16, targetZ: -110, age: 0 });
  smoke.update(b);
  const group = scene.children[0];
  const puff = group.children[1] as THREE.Sprite;
  assert.equal(puff.material.opacity, 0);
  b.smoke[0].age = SMOKE_FLIGHT + 3;
  smoke.update(b);
  assert.ok(puff.material.opacity > 0.5);
  assert.equal(puff.material.depthWrite, false);
  let disposed = false;
  puff.material.addEventListener('dispose', () => {
    disposed = true;
  });
  smoke.update(createPillboxBattle());
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, true);
  smoke.dispose();
});

void test('carriers throw at different stages of the assault, once per assigned position', () => {
  for (const id of [1, 4]) {
    const b = landedSquad();
    const s = b.soldiers[0];
    b.soldiers = [s];
    s.id = id;
    delete s.landingCraftId;
    s.speed = 0;
    for (const [zone, z] of [-120, -74, -46].entries()) {
      s.z = z;
      const before = b.smoke.length;
      stepPillbox(b, 1.1, false);
      const shouldThrow = id === 1 ? zone !== 2 : zone !== 0;
      assert.equal(b.smoke.length, before + Number(shouldThrow));
      stepPillbox(b, 1.1, false);
      assert.equal(
        b.smoke.length,
        before + Number(shouldThrow),
        'no repeat at the same position',
      );
    }
    assert.equal(b.smoke.length, 2);
    assert.equal(new Set(b.smoke.map((g) => g.id)).size, 2);
  }
});

void test('foxhole routes clear obstacles and troops hide, emerge, then complete both barricade stops', () => {
  for (let lane = 0; lane < 5; lane++)
    for (const offset of [-1.1, 0, 1.1]) {
      const route = infantryRoute(lane, offset, true);
      let previous = { x: [-36, -18, 0, 18, 36][lane] + offset, z: -132 };
      assert.equal(route.filter((p) => p.foxhole !== undefined).length, 1);
      for (const point of route) {
        assert.ok(clearSegment(previous, point));
        previous = point;
      }
    }
  const b = landedSquad(),
    s = b.soldiers[2];
  b.soldiers = [s];
  let hidden = false,
    emerged = false;
  for (let i = 0; i < 4000 && s.phase !== 'breached'; i++) {
    stepPillbox(b, 0.025, false);
    if (s.foxholeId !== undefined && !hidden) {
      hidden = true;
      assert.equal(s.phase, 'cover');
      assert.equal(s.coverIndex, 1);
      assert.ok(beachHeight(s.x, s.z) < -1.3);
      s.suppression = 1;
      aimPillbox(b, s.x, s.z);
      stepPillbox(b, 0.001, true);
      assert.equal(s.health, 1);
      assert.match(b.message, /foxhole/);
      const before = structuredClone(b);
      b.status = 'paused';
      stepPillbox(b, 5, false);
      assert.equal(s.timer, before.soldiers[0].timer);
      b.status = 'playing';
    }
    emerged ||= hidden && s.foxholeId === undefined;
  }
  assert.ok(hidden && emerged);
  assert.equal(s.coverIndex, 2);
  assert.equal(s.phase, 'breached');
});

void test('foxholes have deep floors, raised lips and disposable shared dressing', () => {
  for (const hole of FOXHOLES) {
    assert.ok(beachHeight(hole.x, hole.z) < -1.3);
    assert.ok(beachHeight(hole.x + hole.radius, hole.z) > 0.1);
  }
  const scene = new THREE.Scene(),
    holes = new FoxholeDetail(scene);
  const bag = scene.children[0].children[0] as THREE.InstancedMesh;
  assert.equal(bag.count, 55);
  let disposed = false;
  bag.addEventListener('dispose', () => {
    disposed = true;
  });
  holes.dispose();
  assert.ok(disposed);
  assert.equal(scene.children.length, 0);
});
