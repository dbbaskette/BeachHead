import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aimPillbox, createPillboxBattle, stepPillbox } from './simulation';
import { chooseSupplies } from './combat-actions';
import { updateInfantryTactics } from './squad-tactics';
import { BEACH_OBSTACLES } from './navigation';
import { terrainBlocksShot } from './terrain';
import {
  LANES,
  WAVE_COUNTS,
  type Infantry,
  type PillboxBattle,
  type PillboxEvent,
} from './types';

const DT = 0.025;
const CREWS = [
  [1, 'machine-gun'],
  [2, 'machine-gun'],
  [2, 'mortar'],
  [3, 'machine-gun'],
  [3, 'mortar'],
] as const;
type Role = (typeof CREWS)[number][1];
const firingLine = (role: Role) => (role === 'mortar' ? -116 : -96);
const where = (s: Infantry) => `(${s.x.toFixed(1)}, ${s.z.toFixed(1)})`;
const active = (s: Infantry) => s.phase === 'advance' || s.phase === 'cover';

function startWave(wave: number) {
  const b = createPillboxBattle();
  b.status = 'playing';
  for (let w = 1; w < wave; w++) {
    b.status = 'resupply';
    chooseSupplies(b, 'repair');
  }
  return b;
}

/** Runs a wave against an indestructible bunker until its crew digs in. */
function dugIn(wave: number, role: Role) {
  const b = startWave(wave);
  b.health = Infinity;
  let crew: Infantry | undefined;
  for (let t = 0; t < 90 && !crew?.emplacement; t += DT) {
    stepPillbox(b, DT, false);
    crew = b.soldiers.find((s) => s.role === role);
  }
  assert.ok(crew?.emplacement, `wave ${wave} ${role} crew never dug in`);
  b.health = 100;
  return { b, crew };
}

/** Leaves the crew as the only threat on the beach. */
function isolate(b: PillboxBattle, crew: Infantry) {
  b.soldiers = [crew];
  b.spawned = WAVE_COUNTS[b.wave - 1];
  b.jeepSpawned = b.wave;
  b.jeeps = [];
  b.grenades = [];
  b.landingCraft.forEach((c) => (c.gunnerHealth = 0));
}

function assertKilledByAimedFire(b: PillboxBattle, crew: Infantry) {
  assert.equal(
    terrainBlocksShot(crew.x, crew.z),
    false,
    `${crew.role} crew dug in behind a ridge at ${where(crew)}`,
  );
  aimPillbox(b, crew.x, crew.z);
  for (let t = 0; t < 3 && crew.phase !== 'down'; t += DT)
    stepPillbox(b, DT, true);
  assert.equal(crew.phase, 'down', `MG fire cannot kill it at ${where(crew)}`);
}

for (const [wave, role] of CREWS) {
  void test(`wave ${wave} ${role} crew digs in on its firing line where aimed MG fire kills it`, () => {
    const { b, crew } = dugIn(wave, role);
    isolate(b, crew);
    assert.ok(
      Math.abs(crew.z - firingLine(role)) < 1 && Math.abs(crew.x) <= 44,
      `dug in off its firing line at ${where(crew)}`,
    );
    assertKilledByAimedFire(b, crew);
    assert.equal(b.kills, 1);
  });

  void test(`wave ${wave} is winnable with the MG alone once only its ${role} crew is left`, () => {
    const { b, crew } = dugIn(wave, role);
    b.grenadeAmmo = 0;
    b.airSupportCharges = 0;
    for (let t = 0; t < 120 && b.status === 'playing'; t += DT) {
      for (const s of b.soldiers) if (s !== crew && active(s)) s.phase = 'down';
      for (const j of b.jeeps)
        if (j.phase === 'driving' || j.phase === 'unloading') {
          j.phase = 'wreck';
          j.passengers = 0;
        }
      b.landingCraft.forEach((c) => (c.gunnerHealth = 0));
      aimPillbox(b, crew.x, crew.z);
      stepPillbox(b, DT, b.heat < 90);
    }
    assert.equal(crew.phase, 'down', `crew survives at ${where(crew)}`);
    assert.equal(b.status, wave === WAVE_COUNTS.length ? 'won' : 'resupply');
    assert.ok(b.health > 0);
    assert.equal(b.airSupportCharges, 0);
  });

  void test(`wave ${wave} ${role} crew left alone still sets up and fires on schedule`, () => {
    const { b, crew } = dugIn(wave, role);
    isolate(b, crew);
    const site = where(crew),
      from = b.time,
      fired: number[] = [];
    for (let t = 0; t < 24; t += DT)
      for (const e of stepPillbox(b, DT, false))
        if (e.type === (role === 'mortar' ? 'mortar-launch' : 'enemy-fire'))
          fired.push(b.time - from);
    const [delay, every, damage] =
      role === 'mortar' ? [7.5, 8, 18] : [5, 5, 12];
    assert.equal(fired.length, role === 'mortar' ? 3 : 4);
    fired.forEach((at, i) => assert.ok(Math.abs(at - delay - every * i) < 0.1));
    assert.equal(b.health, 100 - damage);
    assert.equal(where(crew), site);
    assert.equal(crew.emplacement, 'firing');
  });
}

for (const wave of [1, 2, 3])
  void test(`wave ${wave} left unopposed ends with nobody on the beach but crews in the MG sights`, () => {
    const b = startWave(wave);
    b.health = Infinity;
    for (let t = 0; t < 240; t += DT) stepPillbox(b, DT, false);
    const holdouts = b.soldiers.filter(active);
    assert.equal(b.spawned, WAVE_COUNTS[wave - 1]);
    assert.ok(b.jeeps.every((j) => j.phase === 'gone'));
    assert.equal(holdouts.length, wave === 1 ? 1 : 2);
    for (const s of holdouts) {
      assert.equal(s.emplacement, 'firing', `${s.role} idle at ${where(s)}`);
      assertKilledByAimedFire(b, s);
    }
  });

void test('a crew landing in any lane digs in on its firing line, clear of obstacles and in the MG sights', () => {
  for (const role of ['machine-gun', 'mortar'] as const)
    for (const lane of LANES.keys())
      for (const offset of [-1.1, 0, 1.1]) {
        const b = createPillboxBattle();
        b.status = 'playing';
        b.spawnTimer = 1000;
        b.jeepSpawned = 1;
        b.landingCraft.forEach((c) => (c.gunnerHealth = 0));
        const crew: Infantry = {
          id: 6,
          role,
          lane,
          offset,
          x: LANES[lane] + offset,
          z: -132,
          health: 4,
          phase: 'advance',
          timer: 0,
          coverIndex: 0,
          waypoint: 0,
          speed: 3.5,
          grenadeState: 'ready',
          grenadeTimer: 0,
        };
        b.soldiers = [crew];
        for (let t = 0; t < 20 && !crew.emplacement; t += DT) {
          const before = { ...crew };
          stepPillbox(b, DT, false);
          assert.ok(
            Math.hypot(crew.x - before.x, crew.z - before.z) <=
              crew.speed * DT + 1e-6,
          );
          for (const o of BEACH_OBSTACLES)
            assert.ok(
              Math.abs(crew.x - o.x) >= o.halfX + 0.69 ||
                Math.abs(crew.z - o.z) >= o.halfZ + 0.69,
              `${role} from lane ${lane} walks through an obstacle`,
            );
        }
        const from = `${role} from lane ${lane} offset ${offset}`;
        assert.ok(
          crew.emplacement,
          `${from} still wandering at ${where(crew)}`,
        );
        assert.ok(
          Math.abs(crew.z - firingLine(role)) < 1,
          `${from} dug in off its firing line at ${where(crew)}`,
        );
        assert.ok(
          Math.abs(crew.x - LANES[lane]) < LANES[1] - LANES[0],
          `${from} strayed a whole lane to ${where(crew)}`,
        );
        assertKilledByAimedFire(b, crew);
      }
});

void test('a crew that finds no open ground stops sidestepping at mid-beach and assaults as riflemen', () => {
  for (const role of ['machine-gun', 'mortar'] as const)
    for (const x of [-37, 39.2]) {
      const b = createPillboxBattle();
      b.status = 'playing';
      const crew: Infantry = {
        id: 6,
        role,
        lane: 2,
        offset: 0,
        x,
        z: firingLine(role) + 0.1,
        health: 4,
        phase: 'advance',
        timer: 0,
        coverIndex: 0,
        waypoint: 0,
        speed: 3.5,
        grenadeState: 'ready',
        grenadeTimer: 0,
      };
      const events: PillboxEvent[] = [],
        gaveUp = () => crew.role === 'rifle';
      let steps = 0;
      for (; steps < 2000 && !gaveUp(); steps++) {
        const before = Math.abs(crew.x);
        const held = updateInfantryTactics(b, crew, DT, events, () => true);
        assert.equal(held, !gaveUp());
        assert.ok(Math.abs(crew.x) < before || gaveUp());
        assert.ok(before - Math.abs(crew.x) <= crew.speed * DT + 1e-9);
      }
      assert.ok(steps * DT < 15, 'bounded by the walk to mid-beach');
      assert.deepEqual(
        [crew.role, crew.x, crew.z, crew.emplacement],
        ['rifle', 0, firingLine(role) + 0.1, undefined],
      );
      assert.equal(b.health + b.grenades.length, 100);
      b.soldiers = [crew];
      b.spawnTimer = 1000;
      b.jeepSpawned = 1;
      b.landingCraft.forEach((c) => (c.gunnerHealth = 0));
      b.health = Infinity;
      for (let t = 0; t < 120 && active(crew); t += DT)
        stepPillbox(b, DT, false);
      assert.equal(crew.phase, 'breached');
      assert.equal(crew.emplacement, undefined);
    }
});
