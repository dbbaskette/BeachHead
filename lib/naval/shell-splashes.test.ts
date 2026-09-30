import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  ShellSplashVisuals,
  shellVisualScale,
  splashScale,
} from './shell-splashes';
import { createBattle, fire, setAim, step } from './simulation';

void test('phone impacts retain a visible footprint and shells stay readable across range and optic changes', () => {
  for (const height of [300, 348, 568, 844])
    for (const fov of [22, 46])
      for (const distance of [250, 550, 1100, 1600]) {
        const focal =
          height / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
        const splash = splashScale(distance, height, fov, true);
        assert.ok(splash >= 1 && splash <= 3.2);
        assert.ok(
          (16 * splash * focal) / distance >= 11,
          'distant phone splash must not shrink to a few pixels',
        );
        const shell = shellVisualScale(distance, height, fov, true);
        assert.ok((0.72 * shell.width * focal) / distance >= 1.7 - 1e-8);
        assert.ok((4.72 * shell.length * focal) / distance >= 8 - 1e-8);
        const desktop = shellVisualScale(distance, height, fov, false);
        assert.equal(desktop.width, Math.max(0.8, distance / 500));
        assert.equal(desktop.length, desktop.width);
      }
});

void test('splash stays at the resolved miss after re-aiming and camera changes, freezes, then expires', () => {
  const b = createBattle();
  b.status = 'playing';
  setAim(b, 10, 600);
  fire(b);
  const target = { x: b.shells[0].targetX, z: b.shells[0].targetZ };
  setAim(b, -40, 1400);
  const events = [];
  for (let i = 0; i < 180; i++) events.push(...step(b, 1 / 60));
  const miss = events.find((e) => e.type === 'miss');
  assert.ok(miss && miss.type === 'miss');
  const visual = new ShellSplashVisuals(new THREE.Scene());
  visual.impact(miss.x, miss.z);
  const group = visual.root.children[0];
  const camera = new THREE.PerspectiveCamera(46, 873 / 348, 0.5, 18000);
  camera.position.set(0, 16, 23);
  visual.update(1.5, camera, 348, true, 1.25);
  assert.equal(group.position.x, target.x);
  assert.equal(group.position.z, target.z);
  const column = group.getObjectByName('shell-water-column') as THREE.Mesh;
  const spray = group.getObjectByName('shell-water-plume') as THREE.Points<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >;
  const foam = group.getObjectByName('shell-impact-foam') as THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
  const height = column.scale.y;
  visual.update(0, camera, 348, true, 1.25);
  assert.equal(column.scale.y, height);
  assert.equal(spray.material.uniforms.age.value, 1.5);
  camera.position.x = 200;
  camera.fov = 22;
  visual.update(3.5, camera, 844, true, 1.25);
  assert.equal(group.position.x, target.x);
  assert.equal(group.position.z, target.z);
  assert.equal(
    foam.material.uniforms.age.value,
    5,
    'foam survives the initial plume',
  );
  visual.update(1, camera, 844, true, 1.25);
  assert.equal(visual.root.children.length, 0);
  visual.dispose();
});

void test('repeated salvo splashes stay bounded and release shared graphics once on disposal', () => {
  const scene = new THREE.Scene(),
    visual = new ShellSplashVisuals(scene);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  let disposed = 0;
  for (let i = 0; i < 24; i++) {
    visual.impact(i * 10, -700);
    assert.ok(visual.root.children.length <= 4);
    visual.root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points)
        for (const resource of [o.geometry, o.material]) {
          if (resources.has(resource)) continue;
          resources.add(resource);
          resource.addEventListener('dispose', () => disposed++);
        }
    });
  }
  assert.equal(visual.root.children.length, 4);
  visual.reset();
  assert.equal(visual.root.children.length, 0);
  visual.dispose();
  visual.dispose();
  assert.equal(disposed, resources.size);
  assert.equal(scene.children.length, 0);
});
