import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { NavalEffects } from './naval/effects';
import {
  BillboardPool,
  createBloodSplatMaterial,
  createBombGeometry,
  createMuzzleFlashMesh,
  TracerPool,
} from './vfx';

void test('BillboardPool configures normal smoke with linear fog before ACES tonemapping and updates attributes', () => {
  const scene = new THREE.Scene();
  const pool = new BillboardPool(scene, 8, {
    blending: 'normal',
    kind: 'smoke',
    renderOrder: 4,
  });

  assert.equal(scene.children.length, 1);
  assert.equal(pool.mesh.renderOrder, 4);
  assert.equal(pool.mesh.count, 0);
  assert.equal(pool.material.fog, true);
  assert.equal(pool.material.blending, THREE.NormalBlending);

  const frag = pool.material.fragmentShader;
  assert.ok(!frag.includes('sin( p.x * 18'), 'no plaid sine grid artifacts');
  const fogIdx = frag.indexOf('#include <fog_fragment>');
  const toneIdx = frag.indexOf('#include <tonemapping_fragment>');
  const colorIdx = frag.indexOf('#include <colorspace_fragment>');
  assert.ok(fogIdx > 0 && toneIdx > fogIdx && colorIdx > toneIdx);

  const geo = pool.mesh.geometry;
  for (const attr of ['aCenter', 'aScale', 'aAlpha', 'aSpin', 'aSeed']) {
    assert.ok(geo.getAttribute(attr), `missing ${attr} attribute`);
  }
  assert.ok(pool.mesh.instanceColor);

  pool.set(0, 10, 20, -30, 4, 5, 0.5, 0.6, 0.7, 0.8, 1.25, 0.35);
  pool.commit(1, 3.5);
  assert.equal(pool.mesh.count, 1);
  assert.equal(pool.material.uniforms.uTime.value, 3.5);
  assert.equal(geo.getAttribute('aCenter').getX(0), 10);
  assert.equal(geo.getAttribute('aCenter').getY(0), 20);
  assert.equal(geo.getAttribute('aCenter').getZ(0), -30);
  assert.equal(geo.getAttribute('aSpin').getX(0), 1.25);
  assert.ok(Math.abs(geo.getAttribute('aSeed').getX(0) - 0.35) < 1e-6);

  pool.clear();
  assert.equal(pool.mesh.count, 0);

  let disposed = 0;
  geo.addEventListener('dispose', () => disposed++);
  pool.material.addEventListener('dispose', () => disposed++);
  pool.dispose();
  assert.equal(disposed, 2);
  assert.equal(scene.children.length, 0);
});

void test('BillboardPool and TracerPool additive shaders attenuate by fog factor without white-out fog_fragment', () => {
  const scene = new THREE.Scene();
  const fire = new BillboardPool(scene, 4, {
    blending: 'additive',
    kind: 'fire',
  });
  const tracers = new TracerPool(scene, 4);

  for (const mat of [fire.material, tracers.material]) {
    assert.equal(mat.blending, THREE.AdditiveBlending);
    assert.equal(mat.fog, true);
    const frag = mat.fragmentShader;
    assert.ok(
      !frag.includes('#include <fog_fragment>'),
      'additive materials must not mix opaque fog color directly',
    );
    assert.ok(frag.includes('1.0 - fogFactor'));
    assert.ok(frag.includes('#include <tonemapping_fragment>'));
    assert.ok(frag.includes('#include <colorspace_fragment>'));
  }

  tracers.set(0, 0, 1, 0, 10, 2, -20, 0.14, 2.2, 1.4, 0.5, 0.9);
  tracers.commit(1);
  assert.equal(tracers.mesh.count, 1);
  assert.equal(tracers.mesh.geometry.getAttribute('aStart').getY(0), 1);
  assert.equal(tracers.mesh.geometry.getAttribute('aEnd').getZ(0), -20);
  assert.ok(
    Math.abs(tracers.mesh.geometry.getAttribute('aWidth').getX(0) - 0.14) <
      1e-6,
  );
  tracers.clear();
  assert.equal(tracers.mesh.count, 0);

  let disposed = 0;
  fire.mesh.geometry.addEventListener('dispose', () => disposed++);
  fire.material.addEventListener('dispose', () => disposed++);
  tracers.mesh.geometry.addEventListener('dispose', () => disposed++);
  tracers.material.addEventListener('dispose', () => disposed++);
  fire.dispose();
  tracers.dispose();
  assert.equal(disposed, 4);
  assert.equal(scene.children.length, 0);
});

void test('createBombGeometry orients tail fins along -noseSign and passes geometry validity', () => {
  for (const sign of [1, -1] as const) {
    const geo = createBombGeometry(sign);
    assert.equal(geo.index, null, 'merged geometry is normalized non-indexed');
    const pos = geo.getAttribute('position');
    assert.ok(pos.count > 100);
    for (let i = 0; i < pos.array.length; i++) {
      assert.ok(Number.isFinite(pos.array[i]));
    }
    let minZ = Infinity;
    let maxZ = -Infinity;
    let widestAtMinZ = 0;
    let widestAtMaxZ = 0;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      if (z < -0.35) widestAtMinZ = Math.max(widestAtMinZ, r);
      if (z > 0.35) widestAtMaxZ = Math.max(widestAtMaxZ, r);
    }
    assert.ok(minZ < -0.6 && maxZ > 0.6);
    if (sign > 0) assert.ok(widestAtMinZ > widestAtMaxZ + 0.05);
    else assert.ok(widestAtMaxZ > widestAtMinZ + 0.05);
    geo.dispose();
  }
});

void test('createMuzzleFlashMesh and createBloodSplatMaterial expose HDR additive and organic fogged decal shaders', () => {
  const flash = createMuzzleFlashMesh(0.8);
  const flashMat = flash.material as THREE.ShaderMaterial;
  assert.equal(flashMat.blending, THREE.AdditiveBlending);
  assert.equal(flashMat.toneMapped, false);
  assert.equal(flashMat.depthWrite, false);
  assert.equal(flash.castShadow, false);
  flash.geometry.dispose();
  flashMat.dispose();

  const blood = createBloodSplatMaterial();
  assert.equal(blood.transparent, true);
  assert.equal(blood.depthWrite, false);
  assert.equal(blood.fog, true);
  const fogIdx = blood.fragmentShader.indexOf('#include <fog_fragment>');
  const toneIdx = blood.fragmentShader.indexOf(
    '#include <tonemapping_fragment>',
  );
  const colorIdx = blood.fragmentShader.indexOf(
    '#include <colorspace_fragment>',
  );
  assert.ok(fogIdx > 0 && toneIdx > fogIdx && colorIdx > toneIdx);
  assert.ok(blood.vertexShader.includes('attribute float aAlpha'));
  assert.ok(blood.vertexShader.includes('attribute float aSeed'));
  blood.dispose();
});

void test('NavalEffects bounds particle pools and releases all GPU resources once on double dispose', () => {
  const scene = new THREE.Scene();
  const fx = new NavalEffects(scene);
  assert.equal(scene.children.length, 2);

  const tracked = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const child of scene.children) {
    if (child instanceof THREE.Mesh) {
      tracked.add(child.geometry);
      tracked.add(child.material as THREE.Material);
    }
  }
  let disposed = 0;
  tracked.forEach((r) => r.addEventListener('dispose', () => disposed++));

  for (let i = 0; i < 15; i++) {
    fx.explosion(new THREE.Vector3(i * 5, 0, -400), true);
    fx.muzzle(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, 0, -1));
    fx.splash(i * 4, -500);
    fx.update(1 / 60);
    assert.ok(fx.count <= 300);
  }
  assert.ok(fx.count > 0);
  fx.reset();
  assert.equal(fx.count, 0);

  fx.dispose();
  fx.dispose();
  assert.equal(disposed, tracked.size);
  assert.equal(scene.children.length, 0);
});
