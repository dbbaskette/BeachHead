import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { AirControls } from './input';
import { AirEffects } from './effects';
import { startAirBattle, stepAir } from './simulation';
import { bombSolution, predictImpact } from './weapons';
import { CENTERS } from './flight';
import { damageTarget, updateTargets, shoreline } from './targets';
import { NEUTRAL } from './types';

void test('independent fire owners, deliberate bomb presses, precision and cancellation', () => {
  const input = new AirControls();
  input.fire('mouse', true);
  input.fire('touch', true);
  input.fire('mouse', false);
  input.pad = { x: 0.4, y: -0.6 };
  input.press('KeyD');
  input.press('ShiftLeft');
  assert.deepEqual(input.sample(), {
    x: 0.75,
    y: -0.6,
    fire: true,
    bomb: false,
  });
  input.press('Space');
  assert.equal(input.sample().bomb, true);
  input.press('Space', true);
  assert.equal(input.sample().bomb, false);
  input.release('Space');
  input.press('Space');
  assert.equal(input.sample().bomb, true);
  input.bomb();
  input.reset();
  assert.deepEqual(input.sample(), NEUTRAL);
});

void test('fixed simulation steps give identical results under different frame delivery patterns', () => {
  function run(frames: number[]) {
    const b = startAirBattle();
    let accumulator = 0,
      total = 0,
      n = 0;
    while (total < 18 - 1e-8) {
      const dt = Math.min(frames[n++ % frames.length], 18 - total);
      total += dt;
      accumulator += dt;
      while (accumulator + 1e-10 >= 1 / 60) {
        stepAir(b, {
          x: Math.sin(b.time * 1.3),
          y: Math.sin(b.time),
          fire: true,
          bomb: false,
        });
        accumulator -= 1 / 60;
      }
    }
    return b;
  }
  assert.deepEqual(run([1 / 60]), run([1 / 30, 0.012, 0.047, 0.025]));
});

void test('two wasted bombs still allow a full unmodified mission victory', () => {
  const b = startAirBattle();
  let releases = 0,
    misses = 0,
    last = false;
  const phases = new Set<string>();
  // A repeatable input-only benchmark: no health, target, ammo or clock edits.
  for (let i = 0; i < 10000 && b.status === 'playing'; i++) {
    const f = b.aircraft,
      command = b.targets.find((t) => t.kind === 'command')!;
    let x = Math.sin(b.time * 1.3),
      y = Math.sin(b.time * 1.1),
      bomb = false;
    if (b.pass === 0 && b.time < 15) {
      x = -1;
      y = 0;
    }
    if (b.pass === 2 && b.phaseTime > 18 && b.phaseTime < 31) {
      x = Math.max(
        -1,
        Math.min(1, (-204 - CENTERS[2] - f.desiredOffset) * 0.2),
      );
      y = (85 - f.desiredAltitude) * 0.2;
    }
    if (b.phase === 'attack') {
      if (b.pass === 0 && releases < 2 && b.phaseTime > 3 + releases * 2)
        bomb = !last;
      if (b.pass === 2) {
        const p = predictImpact(
          bombSolution(f, b.released % 2),
          b.targets,
        )?.position;
        if (
          p &&
          Math.abs(p.z - command.position.z) < 65 &&
          Math.abs(p.x - command.position.x) < 45 &&
          b.bombCooldown <= 0 &&
          command.health > 0
        )
          bomb = !last;
      }
    }
    const before = b.targets.map((t) => t.health).join();
    const events = stepAir(b, { x, y, fire: b.pass === 2, bomb });
    last = bomb;
    for (const e of events) {
      if (e.type === 'bomb-release') releases++;
      if (
        e.type === 'impact' &&
        e.bomb &&
        b.pass === 0 &&
        before === b.targets.map((t) => t.health).join()
      )
        misses++;
    }
    phases.add(b.phase + b.pass);
  }
  assert.equal(misses, 2);
  assert.equal(b.status, 'won');
  assert.ok(b.health > 10);
  assert.ok(b.time > 140 && b.time < 150);
  assert.ok(
    phases.has('attack1') && phases.has('attack2') && phases.has('exit2'),
  );
  assert.equal(releases, 6);
  assert.equal(b.score, 1500);
});

void test('unloading preserves stable identities, destruction denies only unspawned cargo', () => {
  const b = startAirBattle(),
    carrier = b.targets.find((t) => t.kind === 'carrier')!;
  carrier.position.x = shoreline(carrier.position.z) - 16;
  carrier.velocity.x = 0;
  const id = carrier.id;
  updateTargets(b, 4.1);
  assert.equal(carrier.cargo, 2);
  assert.equal(
    b.targets.filter((t) => t.id.startsWith(id + '-cargo')).length,
    1,
  );
  damageTarget(b, carrier, 1000, []);
  assert.equal(b.deniedCargo, 2);
  updateTargets(b, 20);
  assert.equal(
    b.targets.filter((t) => t.id.startsWith(id + '-cargo')).length,
    1,
  );
});

void test('suppression stops new flak while committed shells still resolve', () => {
  const b = startAirBattle();
  b.phase = 'attack';
  b.time = 10;
  stepAir(b);
  const launched = b.flak.length;
  assert.ok(launched > 0);
  for (const t of b.targets) if (t.kind === 'flak') damageTarget(b, t, 100, []);
  let bursts = 0,
    newShots = 0;
  for (let i = 0; i < 600; i++)
    for (const e of stepAir(b)) {
      if (e.type === 'flak-burst') bursts++;
      if (e.type === 'flak') newShots++;
    }
  assert.equal(bursts, launched);
  assert.equal(newShots, 0);
  assert.ok(b.health < 100 && b.health > 0);
});

void test('pause and terminal state freeze every mission phase; invalid bombs expire at exit', () => {
  for (const phase of ['approach', 'attack', 'turn', 'exit'] as const) {
    const b = startAirBattle();
    b.phase = phase;
    b.status = 'paused';
    const before = JSON.stringify(b);
    stepAir(b, { x: 1, y: 1, fire: true, bomb: true });
    assert.equal(JSON.stringify(b), before);
  }
  const b = startAirBattle();
  b.phase = 'exit';
  b.pass = 2;
  b.phaseTime = 8;
  b.targets.forEach((t) => (t.active = false));
  b.projectiles.push({
    id: 999,
    kind: 'bomb',
    origin: { x: -500, y: 10000, z: 0 },
    position: { x: -500, y: 10000, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    age: 11.99,
    life: 12,
    rack: 0,
  });
  stepAir(b);
  assert.equal(b.status, 'lost');
  assert.equal(b.projectiles.length, 0);
  const before = JSON.stringify(b);
  stepAir(b);
  assert.equal(JSON.stringify(b), before);
});

void test('effects stay bounded through sustained battle and retries, then release resources once', () => {
  const scene = new THREE.Scene(),
    fx = new AirEffects(scene);
  let disposed = 0;
  fx.mesh.geometry.addEventListener('dispose', () => disposed++);
  fx.mesh.material.addEventListener('dispose', () => disposed++);
  for (let retry = 0; retry < 10; retry++) {
    for (let i = 0; i < 100; i++) {
      fx.emit({ x: i, y: 0, z: 0 }, 2, 38);
      fx.update(1 / 60, 720, 64, 1.5);
      assert.ok(fx.count <= 512);
    }
    const position = Array.from(fx.mesh.geometry.attributes.position.array);
    fx.update(0, 720, 64, 1.5);
    assert.deepEqual(
      Array.from(fx.mesh.geometry.attributes.position.array),
      position,
    );
    fx.reset();
    assert.equal(fx.count, 0);
  }
  fx.dispose();
  fx.dispose();
  assert.equal(disposed, 2);
  assert.equal(scene.children.length, 0);
});
