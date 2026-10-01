import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createAirBattle, startAirBattle, stepAir } from './simulation';
import { NEUTRAL } from './types';
import {
  bombSolution,
  firstSurface,
  gunSolutions,
  predictImpact,
  projectilePoint,
  releaseBomb,
} from './weapons';
import { CORRIDOR, GUNS, RACKS, hardpoint, steerRelative } from './flight';
import { AirArt, makeAirframe } from './art';
import { bombBlast, damageTarget, makeTarget, terrainHeight } from './targets';

void test('flight is bounded, finite, freezes, and repeat starts have independent state', () => {
  const b = startAirBattle();
  for (let i = 0; i < 1800; i++) stepAir(b, { ...NEUTRAL, x: 1, y: -1 });
  assert.ok(b.aircraft.offset <= CORRIDOR && b.aircraft.position.y >= 34);
  steerRelative(b, Infinity, NaN);
  assert.ok(Number.isFinite(b.aircraft.desiredOffset));
  b.status = 'paused';
  const before = JSON.stringify(b);
  stepAir(b, { x: -1, y: 1, fire: true, bomb: true }, 0.05);
  assert.equal(JSON.stringify(b), before);
  const next = startAirBattle();
  assert.equal(next.bombs, 6);
  assert.equal(next.time, 0);
  assert.notEqual(next.targets[0], b.targets[0]);
});
void test('modeled muzzles and racks agree with ballistic launch snapshots when banked and pitched', () => {
  const art = new AirArt(),
    model = makeAirframe(art),
    f = createAirBattle().aircraft;
  for (const [heading, pitch, bank] of [
    [0, 0, 0],
    [0.3, -0.2, 0.45],
    [Math.PI, 0.15, -0.4],
  ]) {
    Object.assign(f, { heading, pitch, bank });
    f.position = { x: 70, y: 90, z: -220 };
    model.root.position.copy(f.position);
    model.root.rotation.set(pitch, -heading, bank, 'YXZ');
    model.root.updateMatrixWorld(true);
    GUNS.forEach((p, i) => {
      const rendered = model.gunNodes[i].getWorldPosition(new THREE.Vector3());
      assert.ok(
        rendered.distanceTo(
          new THREE.Vector3(...Object.values(hardpoint(f, p))),
        ) < 1e-8,
      );
      assert.deepEqual(gunSolutions(f)[i].origin, hardpoint(f, p));
    });
    RACKS.forEach((p, i) => {
      const rendered = model.bombs[i].getWorldPosition(new THREE.Vector3());
      assert.ok(
        rendered.distanceTo(
          new THREE.Vector3(...Object.values(bombSolution(f, i).origin)),
        ) < 1e-8,
      );
    });
  }
  art.dispose();
});
void test('held bombs release once, alternate actual racks, and ignore subsequent steering', () => {
  const b = startAirBattle();
  b.phase = 'attack';
  stepAir(b, { ...NEUTRAL, bomb: true });
  const p = b.projectiles.find((p) => p.kind === 'bomb')!;
  const origin = { ...p.origin },
    velocity = { ...p.velocity };
  for (let i = 0; i < 50; i++) stepAir(b, { ...NEUTRAL, bomb: true });
  assert.equal(b.bombs, 5);
  steerRelative(b, 80, 60);
  assert.deepEqual(p.origin, origin);
  assert.deepEqual(p.velocity, velocity);
  stepAir(b, NEUTRAL);
  stepAir(b, { ...NEUTRAL, bomb: true });
  assert.equal(b.bombs, 4);
  assert.equal(b.projectiles.filter((p) => p.kind === 'bomb')[1].rack, 1);
  b.phase = 'turn';
  b.bombCooldown = 0;
  assert.equal(releaseBomb(b), null);
});
void test('prediction matches first swept bomb impact on water, dunes, and a moving deck', () => {
  for (const x of [-500, 250, -150]) {
    const b = startAirBattle();
    b.phase = 'attack';
    b.aircraft.position = { x, y: 90, z: 600 };
    b.aircraft.velocity = { x: 0, y: 0, z: -65 };
    const boat = makeTarget('carrier', 'test', -150, 335);
    boat.velocity.x = 1;
    const targets = x === -150 ? [boat] : [];
    const solution = bombSolution(b.aircraft, 0),
      predicted = predictImpact(solution, targets)!;
    let prior = solution.origin,
      actual = null;
    for (let age = 1 / 60; age < 8; age += 1 / 60) {
      const p = projectilePoint(solution, age);
      actual = firstSurface(prior, p, targets, age, 1 / 60);
      if (actual) break;
      prior = p;
    }
    assert.ok(actual);
    assert.ok(
      new THREE.Vector3(...Object.values(actual.position)).distanceTo(
        new THREE.Vector3(...Object.values(predicted.position)),
      ) < 0.08,
    );
    assert.equal(actual.water, x === -500);
    if (x === 250)
      assert.ok(
        actual.position.y >=
          terrainHeight(actual.position.x, actual.position.z) - 0.01,
      );
    if (x === -150) assert.equal(actual.target?.id, 'test');
  }
});
void test('swept bullets cannot tunnel, blasts award each destruction once and cancel only remaining cargo', () => {
  const b = startAirBattle(),
    t = makeTarget('carrier', 'c', -100, 0);
  b.targets = [t];
  assert.equal(
    firstSurface({ x: -200, y: 5, z: 0 }, { x: 0, y: 5, z: 0 }, [t])?.target
      ?.id,
    'c',
  );
  bombBlast(b, { x: -100, y: 3, z: 0 }, []);
  const score = b.score;
  assert.equal(b.deniedCargo, 3);
  bombBlast(b, { x: -100, y: 3, z: 0 }, []);
  assert.equal(b.score, score);
  damageTarget(b, t, 100, []);
  assert.equal(b.destroyed, 1);
});
void test('flak commits its endpoint, allows evasion, and destroyed batteries stay silent', () => {
  const b = startAirBattle();
  b.phase = 'attack';
  b.time = 9;
  const t = makeTarget('flak', 'f', -170, 1500);
  t.nextFire = 0;
  b.targets = [t];
  stepAir(b);
  assert.equal(b.flak.length, 1);
  const point = { ...b.flak[0].end };
  damageTarget(b, t, 100, []);
  for (let i = 0; i < 145; i++) stepAir(b, { ...NEUTRAL, x: 1 });
  assert.deepEqual(point, { x: -170, y: 85, z: 1690 - 65 / 60 - 65 * 2.35 });
  assert.equal(b.health, 100);
  assert.equal(b.flak.length, 0);
});
void test('final airborne bombs resolve before objective failure and aircraft loss overrides success', () => {
  const b = startAirBattle();
  b.phase = 'exit';
  b.pass = 2;
  b.phaseTime = 7.99;
  b.targets.forEach((t) => (t.health = 0));
  const command = b.targets.find((t) => t.kind === 'command')!;
  command.active = true;
  command.health = 150;
  command.position = { x: -200, y: 0, z: -1400 };
  b.projectiles.push({
    id: 1,
    kind: 'bomb',
    origin: { x: -200, y: 50, z: -1400 },
    position: { x: -200, y: 50, z: -1400 },
    velocity: { x: 0, y: 0, z: 0 },
    age: 0,
    life: 12,
    rack: 0,
  });
  stepAir(b);
  assert.equal(b.status, 'playing');
  for (let i = 0; i < 180; i++) stepAir(b);
  assert.equal(b.status, 'won');
  const dead = startAirBattle();
  dead.phase = 'exit';
  dead.phaseTime = 8;
  dead.health = 0;
  dead.targets.forEach((t) => (t.health = 0));
  stepAir(dead);
  assert.equal(dead.status, 'lost');
});
void test('unattended mission loses and a surviving aircraft cannot win with an intact command transport', () => {
  const b = startAirBattle();
  for (let i = 0; i < 10000 && b.status === 'playing'; i++) stepAir(b);
  assert.equal(b.status, 'lost');
  const miss = startAirBattle();
  miss.phase = 'exit';
  miss.pass = 2;
  miss.phaseTime = 8;
  miss.targets.forEach((t) => (t.nextFire = 999));
  stepAir(miss);
  assert.equal(miss.status, 'lost');
  assert.match(miss.outcome, /transport escaped/);
});
