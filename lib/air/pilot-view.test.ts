import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { AirArt, makeAirframe } from './art';
import { createAircraft } from './flight';
import { placePilotCamera } from './pilot-view';
import { gunSolutions, predictImpact, projectilePoint } from './weapons';

void test('cockpit stays around the pilot through heading, pitch and bank changes', () => {
  const f = createAircraft(),
    camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.12, 14000),
    model = new THREE.Object3D();
  let reference: THREE.Vector3 | undefined;
  for (const [heading, pitch, bank] of [
    [0, 0, 0],
    [0.8, 0.16, 0.4],
    [Math.PI, -0.16, -0.5],
  ]) {
    Object.assign(f, { heading, pitch, bank });
    model.position.copy(f.position);
    model.rotation.set(pitch, -heading, bank, 'YXZ');
    model.updateMatrixWorld(true);
    placePilotCamera(camera, f, false);
    camera.updateMatrixWorld(true);
    const windscreenCorner = new THREE.Vector3(1.3, 4.85, -0.2)
      .applyMatrix4(model.matrixWorld)
      .applyMatrix4(camera.matrixWorldInverse);
    if (reference) assert.ok(reference.distanceTo(windscreenCorner) < 1e-8);
    else reference = windscreenCorner;
  }
  placePilotCamera(camera, f, true);
  const stable = camera.quaternion.clone();
  f.pitch = -f.pitch;
  f.bank = -f.bank;
  placePilotCamera(camera, f, true);
  assert.ok(stable.angleTo(camera.quaternion) < 1e-8);
});

void test('cockpit leaves the gun aiming line unobstructed across the flight envelope', () => {
  const art = new AirArt(),
    plane = makeAirframe(art),
    f = createAircraft(),
    camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.12, 14000);
  for (const altitude of [34, 85, 140])
    for (const pitch of [-0.16, 0, 0.16])
      for (const bank of [-0.5, 0, 0.5]) {
        f.position.y = altitude;
        Object.assign(f, { pitch, bank });
        plane.root.position.copy(f.position);
        plane.root.rotation.set(pitch, -f.heading, bank, 'YXZ');
        plane.root.updateMatrixWorld(true);
        placePilotCamera(camera, f, false);
        camera.updateMatrixWorld(true);
        const points = gunSolutions(f).map(
          (g) => predictImpact(g, [], 2)?.position ?? projectilePoint(g, 0.7),
        );
        const aim = new THREE.Vector3(
          (points[0].x + points[1].x) / 2,
          (points[0].y + points[1].y) / 2,
          (points[0].z + points[1].z) / 2,
        );
        const ray = new THREE.Raycaster(
          camera.position,
          aim.sub(camera.position).normalize(),
        );
        const solidHits = ray
          .intersectObject(plane.root, true)
          .filter((hit) => {
            const object = hit.object as THREE.Mesh;
            return (
              !Array.isArray(object.material) && !object.material.transparent
            );
          });
        assert.equal(
          solidHits.length,
          0,
          `clear view at ${altitude} m, pitch ${pitch}, bank ${bank}`,
        );
      }
  art.dispose();
});

void test('pilot can see both shoulders of the engine cowling beyond the dashboard', () => {
  const art = new AirArt(),
    plane = makeAirframe(art),
    f = createAircraft(),
    camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.12, 14000);
  plane.root.position.copy(f.position);
  plane.root.updateMatrixWorld(true);
  placePilotCamera(camera, f, false);
  camera.updateMatrixWorld(true);
  for (const side of [-1, 1]) {
    // Sample the exposed upper engine housing, leaving tolerance for its seam.
    const cowling = new THREE.Vector3(side * 1.1, 1.15, -3.8).applyMatrix4(
      plane.root.matrixWorld,
    );
    const distance = camera.position.distanceTo(cowling);
    const ray = new THREE.Raycaster(
      camera.position,
      cowling.clone().sub(camera.position).normalize(),
      0,
      distance - 0.08,
    );
    const obstructions = ray.intersectObject(plane.root, true).filter((hit) => {
      const mesh = hit.object as THREE.Mesh;
      return !Array.isArray(mesh.material) && !mesh.material.transparent;
    });
    assert.equal(
      obstructions.length,
      0,
      'dashboard and rear fairing must not hide the nose',
    );
    const projected = cowling.project(camera);
    assert.ok(
      Math.abs(projected.x) < 0.9 && Math.abs(projected.y) < 0.9,
      'engine cowling remains inside the view',
    );
  }
  art.dispose();
});
