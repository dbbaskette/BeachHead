import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  BunkerSSAOPass,
  createBunkerEnvironmentScene,
} from './post-processing';

void test('BunkerSSAOPass.withHiddenNonCasters hides transparents and viewmodel roots and always restores visibility', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 180);

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ transparent: false }),
  );
  const preHidden = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ transparent: false }),
  );
  preHidden.visible = false;

  const stain = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ transparent: true }),
  );
  const weaponGroup = new THREE.Group();
  const rifle = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.5),
    new THREE.MeshStandardMaterial(),
  );
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ transparent: true }),
  );
  weaponGroup.add(rifle, flash);
  scene.add(wall, preHidden, stain, weaponGroup);

  const pass = new BunkerSSAOPass(scene, camera, [weaponGroup]);
  pass.setSize(1280, 720);
  assert.equal(pass.width, 640);
  assert.equal(pass.height, 360);

  pass.withHiddenNonCasters(() => {
    assert.equal(wall.visible, true, 'opaque world geometry remains visible');
    assert.equal(preHidden.visible, false);
    assert.equal(stain.visible, false, 'transparent decal is hidden from AO');
    assert.equal(weaponGroup.visible, false, 'excluded root hidden from AO');
    assert.equal(rifle.visible, false, 'excluded descendant hidden from AO');
    assert.equal(flash.visible, false);
  });

  assert.equal(wall.visible, true);
  assert.equal(preHidden.visible, false, 'already-hidden objects stay hidden');
  assert.equal(stain.visible, true);
  assert.equal(weaponGroup.visible, true);
  assert.equal(rifle.visible, true);
  assert.equal(flash.visible, true);

  assert.throws(() => {
    pass.withHiddenNonCasters(() => {
      throw new Error('simulated GL failure');
    });
  }, /simulated GL failure/);
  assert.equal(stain.visible, true, 'restored in finally after exception');
  assert.equal(weaponGroup.visible, true);
  assert.equal(rifle.visible, true);
  assert.equal(preHidden.visible, false);

  pass.dispose();
  for (const m of [wall, preHidden, stain, rifle, flash]) {
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
});

void test('createBunkerEnvironmentScene provides tungsten ceiling strips and disposes every owned resource once', () => {
  const env = createBunkerEnvironmentScene();
  const tracked = new Set<THREE.BufferGeometry | THREE.Material>();
  let hdrStripCount = 0;

  env.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      tracked.add(o.geometry);
      const mat = o.material as THREE.MeshBasicMaterial;
      tracked.add(mat);
      if (mat.color.r > 1 || mat.color.g > 1 || mat.color.b > 1) {
        hdrStripCount++;
      }
    }
  });
  assert.equal(hdrStripCount, 3, 'HDR ceiling light strips illuminate PMREM');

  let disposed = 0;
  tracked.forEach((r) => r.addEventListener('dispose', () => disposed++));
  env.dispose();
  assert.equal(disposed, tracked.size);
});
