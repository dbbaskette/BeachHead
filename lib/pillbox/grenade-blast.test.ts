import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { GrenadeBlast } from './grenade-blast';
import { createPillboxBattle, stepPillbox } from './simulation';
import { GRENADE_FLIGHT, grenadeImpactPoint } from './types';

void test('grenade damage emits a visible impact at the same endpoint used by its arc', () => {
  const battle = createPillboxBattle();
  battle.status = 'playing';
  battle.spawnTimer = 100;
  battle.grenades.push({ id: 11, x: 20, z: -35, age: GRENADE_FLIGHT - 0.01 });
  const impact = stepPillbox(battle, 0.02, false).find(
    (e) => e.type === 'grenade-impact',
  );
  assert.deepEqual(impact, {
    type: 'grenade-impact',
    ...grenadeImpactPoint(11),
  });
  assert.equal(battle.health, 88);
  assert.equal(battle.grenades.length, 0);
});

void test('grenade flash and shake settle while smoke lingers; pause and reduced motion are respected', () => {
  const scene = new THREE.Scene(),
    blast = new GrenadeBlast(scene);
  blast.trigger(4, -14);
  blast.update(0.05, false);
  const root = scene.getObjectByName('grenade-blast')!;
  const flash = root.children[0] as THREE.Sprite;
  const smoke = root.children[1] as THREE.Sprite;
  assert.ok(flash.visible && flash.material.opacity > 0.5);
  assert.ok(blast.shake.length() > 0.05 && blast.shake.length() <= 0.6);
  assert.ok(
    (
      scene.children.find(
        (o) => o instanceof THREE.PointLight,
      ) as THREE.PointLight
    ).intensity > 0,
  );
  const position = smoke.position.clone(),
    shake = blast.shake.clone();
  blast.update(0, false);
  assert.ok(smoke.position.equals(position));
  assert.ok(blast.shake.equals(shake));
  blast.update(0, true);
  assert.equal(blast.shake.length(), 0);
  assert.equal(blast.roll, 0);
  blast.update(2, false);
  assert.equal(flash.visible, false);
  assert.ok(smoke.material.opacity > 0.3);
  assert.ok(blast.shake.length() < 0.001);
  blast.update(4, false);
  assert.equal(scene.getObjectByName('grenade-blast'), undefined);
  blast.dispose();
  assert.equal(scene.children.length, 0);
});

void test('overlapping blasts stay bounded and reset removes smoke and camera motion', () => {
  const scene = new THREE.Scene(),
    blast = new GrenadeBlast(scene);
  blast.trigger(0, -14);
  const old = scene.getObjectByName('grenade-blast')!
    .children[1] as THREE.Sprite;
  let disposed = false;
  old.material.addEventListener('dispose', () => {
    disposed = true;
  });
  for (let i = 0; i < 8; i++) blast.trigger(i % 3, -14);
  assert.equal(
    scene.children.filter((o) => o.name === 'grenade-blast').length,
    4,
  );
  assert.ok(disposed);
  blast.update(0.05, false);
  assert.ok(blast.shake.length() <= 0.6);
  blast.clear();
  assert.equal(blast.shake.length(), 0);
  assert.equal(
    scene.children.filter((o) => o.name === 'grenade-blast').length,
    0,
  );
  blast.dispose();
});
