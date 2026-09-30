import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createBattle, fire, setAim, step } from './simulation';
import { shipImpactSite, sinkingPose } from './ship-impact';
import { ShipDamageVisuals } from './ship-damage';

void test('a resolved hit records its own hull location and keeps earlier damage sites', () => {
  const b = createBattle();
  b.status = 'playing';
  b.ships.forEach((s) => {
    s.speed = 0;
    s.nextFire = 999;
  });
  const ship = b.ships[1];
  ship.heading = 0.6;
  for (const z of [-30, 30]) {
    const local = new THREE.Vector3(3, 6.5, z);
    const world = local
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -ship.heading)
      .add(new THREE.Vector3(ship.x, 0, ship.z));
    setAim(
      b,
      (Math.atan2(world.x, -world.z) * 180) / Math.PI,
      Math.hypot(world.x, world.z),
    );
    b.reload = 0;
    fire(b);
    const events = [];
    for (let t = 0; t < 180; t++) events.push(...step(b, 1 / 60));
    const hit = events.find((e) => e.type === 'hit');
    assert.ok(hit && hit.type === 'hit');
    assert.ok(Math.abs(hit.localPoint.x - 3) < 1e-8);
    assert.ok(Math.abs(hit.localPoint.z - z) < 1e-8);
    assert.equal(hit.localPoint.y, 6.5);
    const sunk = events.find((e) => e.type === 'sunk');
    if (z > 0) {
      assert.ok(sunk && sunk.type === 'sunk');
      assert.deepEqual(sunk.localPoint, hit.localPoint);
    }
  }
  assert.equal(ship.damageSites.length, 2);
  assert.ok(ship.damageSites[0].z < 0 && ship.damageSites[1].z > 0);
  assert.ok(createBattle().ships.every((s) => s.damageSites.length === 0));
});

void test('impact footprints clamp to the hull, and sinking favors the damaged side and end', () => {
  const ship = createBattle().ships[0];
  ship.x = ship.z = ship.heading = 0;
  const bow = shipImpactSite(ship, 100, -ship.length);
  assert.ok(bow.z >= -ship.length * 0.48 && bow.x < ship.width / 2);
  const left = sinkingPose(7, ship.length, { x: -5, y: 6.5, z: -30 });
  const right = sinkingPose(7, ship.length, { x: 5, y: 6.5, z: 30 });
  assert.ok(left.roll > 0 && right.roll < 0);
  assert.ok(left.pitch < 0 && right.pitch > 0);
  assert.ok(sinkingPose(1, ship.length, bow).y > left.y);
  assert.equal(sinkingPose(18, ship.length, bow).visible, false);
  assert.ok(sinkingPose(18, ship.length, bow).y < -ship.length * 0.8);
});

void test('fire follows each moving damage site, freezes on pause and stops underwater', () => {
  const scene = new THREE.Scene();
  const fires: THREE.Vector3[] = [];
  const visual = new ShipDamageVisuals(scene, {
    burn: (p) => fires.push(p.clone()),
    explosion: () => {},
    splash: () => {},
  });
  const ship = createBattle().ships[0];
  ship.health = 50;
  ship.damageSites = [{ x: 3, y: 6.5, z: 20 }];
  const mesh = new THREE.Group();
  mesh.position.set(100, 0, -600);
  mesh.rotation.y = 0.7;
  scene.add(mesh);
  visual.updateShip(ship, mesh, 0.23);
  assert.ok(
    fires[0].distanceTo(mesh.localToWorld(new THREE.Vector3(3, 6.5, 20))) <
      1e-8,
  );
  mesh.position.x += 20;
  visual.updateShip(ship, mesh, 0);
  assert.equal(fires.length, 1);
  visual.updateShip(ship, mesh, 0.23);
  assert.ok(Math.abs(fires[1].x - fires[0].x - 20) < 1e-8);
  assert.equal(
    mesh.children.filter((c) => c.name === 'shell-impact-scar').length,
    1,
  );
  ship.health = 0;
  visual.updateShip(ship, mesh, 15);
  const count = fires.length;
  visual.updateShip(ship, mesh, 1);
  assert.equal(fires.length, count, 'submerged fire sites must stop emitting');
  const pos = mesh.position.clone(),
    rot = mesh.rotation.clone();
  visual.updateShip(ship, mesh, 0);
  assert.ok(mesh.position.equals(pos) && mesh.rotation.equals(rot));
  visual.dispose();
  assert.equal(mesh.children.length, 0);
});

void test('sinking debris stays bounded, lingers at the surface and cleans up on reset and dispose', () => {
  const scene = new THREE.Scene();
  const visual = new ShipDamageVisuals(scene, {
    burn: () => {},
    explosion: () => {},
    splash: () => {},
  });
  const ship = createBattle().ships[0];
  ship.health = 0;
  ship.damageSites = [{ x: 2, y: 6.5, z: 10 }];
  const mesh = new THREE.Group();
  scene.add(mesh);
  visual.updateShip(ship, mesh, 0.1);
  for (let i = 0; i < 120; i++) {
    visual.updateShip(ship, mesh, 0.1);
    visual.update(0.1);
  }
  const debris = scene.children.filter((c) => c.name === 'floating-wreckage');
  assert.equal(debris.length, 10);
  assert.ok(debris.every((d) => d.position.y > 0 && d.position.y < 0.5));
  const position = debris[0].position.clone();
  visual.update(0);
  assert.ok(debris[0].position.equals(position));
  let disposed = 0;
  (debris[0] as THREE.Mesh).geometry.addEventListener(
    'dispose',
    () => disposed++,
  );
  visual.reset();
  assert.equal(
    scene.children.filter((c) => c.name === 'floating-wreckage').length,
    0,
  );
  assert.equal(mesh.children.length, 0);
  visual.dispose();
  assert.equal(disposed, 1);
});
