import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { COASTAL_SUN, snapDirectionalShadow } from './daylight';
import {
  enableWaterReflection,
  makeOcean,
  WATER_REFLECTION_LAYER,
} from './ocean';

void test('planar ocean constrains reflection camera layer, clears stale wakes, tracks player wake, orders fog before tonemapping, and disposes its FBO', () => {
  const normalMap = new THREE.Texture();
  const ocean = makeOcean({
    reflection: 'planar',
    textureSize: 256,
    normalMap,
  });

  assert.ok(ocean.renderTarget);
  assert.equal(ocean.renderTarget.width, 256);
  assert.equal(ocean.renderTarget.height, 256);
  assert.ok(ocean.mirrorCamera);
  assert.equal(
    ocean.mirrorCamera.layers.mask,
    1 << WATER_REFLECTION_LAYER,
    'mirror camera only renders objects opted into the water reflection layer',
  );

  const probe = new THREE.Group();
  const child = new THREE.Mesh();
  probe.add(child);
  enableWaterReflection(probe);
  assert.ok((child.layers.mask & (1 << WATER_REFLECTION_LAYER)) !== 0);
  assert.ok((child.layers.mask & 1) !== 0);

  const frag = ocean.material.fragmentShader;
  const fogIdx = frag.indexOf('#include <fog_fragment>');
  const toneIdx = frag.indexOf('#include <tonemapping_fragment>');
  assert.ok(fogIdx > 0 && toneIdx > fogIdx, 'fog runs before ACES tonemapping');
  assert.ok(frag.includes('clamp( reflectionUv'));

  ocean.update(
    4,
    {
      ships: [
        { x: 10, z: -400, heading: 0.1, length: 120, health: 100 },
        { x: 40, z: -600, heading: 0.2, length: 110, health: 100 },
        { x: -30, z: -800, heading: -0.1, length: 130, health: 100 },
      ],
    },
    { x: 0, z: -13, heading: 0, length: 108, health: 100 },
  );
  const wakes = ocean.material.uniforms.uWakes.value as THREE.Vector4[];
  assert.equal(wakes[3].w, 108);

  ocean.update(5, {
    ships: [{ x: 15, z: -420, heading: 0.1, length: 120, health: 100 }],
  });
  assert.equal(wakes[0].x, 15);
  assert.equal(wakes[1].w, 0, 'shrinking ship list clears prior wake slot 1');
  assert.equal(wakes[2].w, 0, 'shrinking ship list clears prior wake slot 2');
  assert.equal(wakes[3].w, 0, 'clearing player wake zeros slot 3');

  let fboDisposed = false;
  let geoDisposed = false;
  let matDisposed = false;
  let normalDisposed = false;
  ocean.renderTarget.addEventListener('dispose', () => {
    fboDisposed = true;
  });
  ocean.mesh.geometry.addEventListener('dispose', () => {
    geoDisposed = true;
  });
  ocean.material.addEventListener('dispose', () => {
    matDisposed = true;
  });
  normalMap.addEventListener('dispose', () => {
    normalDisposed = true;
  });

  ocean.dispose();
  assert.ok(fboDisposed && geoDisposed && matDisposed);
  assert.equal(normalDisposed, false, 'caller-owned normalMap is not disposed');
  normalMap.dispose();
});

void test('environment ocean skips planar render target and supports shoreline surf', () => {
  const normalMap = new THREE.Texture();
  const ocean = makeOcean({
    reflection: 'environment',
    shorelineZ: -82,
    normalMap,
  });

  assert.equal(ocean.renderTarget, null);
  assert.equal(ocean.mirrorCamera, null);
  assert.equal(ocean.material.uniforms.uHasShoreline.value, 1);
  assert.equal(ocean.material.uniforms.uShorelineZ.value, -82);

  ocean.dispose();
  normalMap.dispose();
});

void test('snapDirectionalShadow offsets sun along COASTAL_SUN and quantizes target to texels', () => {
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -52,
    right: 52,
    top: 52,
    bottom: -52,
  });

  snapDirectionalShadow(sun, 12.34, 0, -187.65, 200);
  const deltaA = sun.position.clone().sub(sun.target.position);
  assert.ok(deltaA.distanceTo(COASTAL_SUN.clone().multiplyScalar(200)) < 1e-6);

  // Tiny sub-texel movement (texel = 104 / 2048 ≈ 0.05078m) has zero lateral shift.
  const firstTarget = sun.target.position.clone();
  snapDirectionalShadow(sun, 12.341, 0, -187.651, 200);
  const lateralShift = sun.target.position
    .clone()
    .sub(firstTarget)
    .cross(COASTAL_SUN)
    .length();
  assert.ok(lateralShift < 1e-9);
});
