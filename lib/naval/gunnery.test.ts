import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { makePlayerDeck, aimPlayerDeck } from './models';
import {
  createBattle,
  fire,
  setAim,
  shellPosition,
  rangeToElevation,
} from './simulation';
import type { NavalMaterials } from './materials';

// Actual deck geometry and articulating transforms; plain materials keep this test GPU-free.
function deck() {
  const material = new THREE.MeshStandardMaterial();
  const materials: NavalMaterials = {
    steel: material,
    dark: material,
    deck: material,
    gunmetal: material,
    black: material,
    brass: material,
    glass: new THREE.MeshPhysicalMaterial(),
    red: material,
    ivory: material,
    label: () => material,
    dispose: () => {
      material.dispose();
      materials.glass.dispose();
    },
  };
  const player = makePlayerDeck(materials);
  return {
    player,
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      player.root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line)
          geometries.add(o.geometry);
      });
      geometries.forEach((g) => g.dispose());
      materials.dispose();
    },
  };
}

void test('both shells leave their rendered muzzle along the bore at every bearing and range', () => {
  const fixture = deck();
  for (const heading of [-55, -20, 0, 23, 55]) {
    for (const range of [250, 550, 820, 1200, 1600]) {
      const b = createBattle();
      b.status = 'playing';
      setAim(b, heading, range);
      fire(b);
      const shell = b.shells[0];
      aimPlayerDeck(fixture.player, heading, range);
      fixture.player.root.updateMatrixWorld(true);
      const bore = new THREE.Vector3(0, 0, -1).applyQuaternion(
        fixture.player.guns.getWorldQuaternion(new THREE.Quaternion()),
      );
      assert.ok(
        Math.abs(
          (Math.asin(bore.y) * 180) / Math.PI - rangeToElevation(range),
        ) < 1e-9,
      );
      assert.equal(shell.muzzles?.length, 2);
      for (const [barrel, muzzle] of fixture.player.muzzles.entries()) {
        const p = shellPosition(shell, barrel);
        const q = shellPosition({ ...shell, age: 0.000001 }, barrel);
        const origin = new THREE.Vector3(p.x, p.y, p.z);
        assert.ok(
          origin.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())) <
            1e-9,
        );
        const velocity = new THREE.Vector3(
          q.x - p.x,
          q.y - p.y,
          q.z - p.z,
        ).normalize();
        assert.ok(
          velocity.dot(bore) > 0.9999999999,
          `off-bore launch at ${heading}° / ${range}m`,
        );
        assert.ok(
          new THREE.Vector3(
            shell.direction!.x,
            shell.direction!.y,
            shell.direction!.z,
          ).distanceTo(bore) < 1e-9,
          'flash direction matches the same bore',
        );
      }
    }
  }
  fixture.dispose();
});

void test('the salvo falls with constant acceleration and brackets the unchanged range target', () => {
  for (const range of [250, 820, 1600]) {
    const b = createBattle();
    b.status = 'playing';
    setAim(b, 37, range);
    fire(b);
    const s = b.shells[0];
    const y = (t: number) => shellPosition({ ...s, age: s.duration * t }).y;
    const a = y(0.4) - 2 * y(0.3) + y(0.2);
    const c = y(0.8) - 2 * y(0.7) + y(0.6);
    assert.ok(a < 0 && Math.abs(a - c) < 1e-8);
    for (let i = 0; i <= 20; i++) assert.ok(y(i / 20) >= -1e-8);
    const left = shellPosition({ ...s, age: s.duration }, 0);
    const right = shellPosition({ ...s, age: s.duration }, 1);
    assert.ok(Math.abs((left.x + right.x) / 2 - s.targetX) < 1e-9);
    assert.ok(Math.abs((left.z + right.z) / 2 - s.targetZ) < 1e-9);
    assert.ok(Math.abs(left.y) < 1e-9 && Math.abs(right.y) < 1e-9);
    assert.ok(
      Math.abs(Math.hypot(left.x - right.x, left.z - right.z) - 4.3) < 1e-9,
    );
  }
});

void test('re-aiming and recoil cannot move an airborne salvo or its recorded muzzle flash', () => {
  const fixture = deck();
  const b = createBattle();
  b.status = 'playing';
  setAim(b, -35, 900);
  fire(b);
  const s = b.shells[0];
  s.age = s.duration * 0.4;
  const before = structuredClone(s),
    position = shellPosition(s, 0);
  aimPlayerDeck(fixture.player, b.heading, b.range);
  fixture.player.root.updateMatrixWorld(true);
  const muzzle = fixture.player.muzzles[0].getWorldPosition(
    new THREE.Vector3(),
  );
  aimPlayerDeck(fixture.player, b.heading, b.range, 1);
  fixture.player.root.updateMatrixWorld(true);
  const recoil = fixture.player.muzzles[0]
    .getWorldPosition(new THREE.Vector3())
    .sub(muzzle);
  const bore = new THREE.Vector3(0, 0, -1).applyQuaternion(
    fixture.player.guns.getWorldQuaternion(new THREE.Quaternion()),
  );
  assert.ok(recoil.normalize().dot(bore) < -0.999999999);
  setAim(b, 50, 1500);
  aimPlayerDeck(fixture.player, b.heading, b.range);
  assert.deepEqual(s, before);
  assert.deepEqual(shellPosition(s, 0), position);
  fixture.dispose();
});
