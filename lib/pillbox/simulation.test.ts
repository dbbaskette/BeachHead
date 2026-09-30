import { BEACH_OBSTACLES, clearSegment, infantryRoute } from './navigation';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  AIM_BOUNDS,
  COVER_ROWS,
  WAVE_COUNTS,
  type PillboxBattle,
} from './types';
import { aimPillbox, createPillboxBattle, stepPillbox } from './simulation';
import { chooseSupplies } from './combat-actions';
import { terrainBlocksShot } from './terrain';

function advance(battle: PillboxBattle, seconds: number, firing = false): void {
  for (
    let elapsed = 0;
    elapsed < seconds && battle.status === 'playing';
    elapsed += 0.05
  ) {
    stepPillbox(battle, Math.min(0.05, seconds - elapsed), firing);
  }
}

function firstLanding(battle: PillboxBattle) {
  for (let i = 0; i < 400 && battle.soldiers.length === 0; i++)
    stepPillbox(battle, 0.025, false);
  assert.equal(battle.soldiers.length, 1);
}

void describe('pillbox simulation', () => {
  void test('creates a clean battle and clamps only finite aim coordinates', () => {
    const battle = createPillboxBattle();
    assert.equal(battle.status, 'ready');
    assert.equal(battle.wave, 1);
    assert.equal(battle.health, 100);
    aimPillbox(battle, 100, -500);
    assert.deepEqual(
      [battle.aimX, battle.aimZ],
      [AIM_BOUNDS.maxX, AIM_BOUNDS.minZ],
    );
    aimPillbox(battle, Number.NaN, Number.POSITIVE_INFINITY);
    assert.deepEqual(
      [battle.aimX, battle.aimZ],
      [AIM_BOUNDS.maxX, AIM_BOUNDS.minZ],
    );
  });

  void test('spawns deterministic waves and infantry use both cover rows', () => {
    const battle = createPillboxBattle();
    battle.status = 'playing';
    firstLanding(battle);
    assert.equal(battle.soldiers.length, 1);
    assert.deepEqual([battle.soldiers[0].id, battle.soldiers[0].lane], [1, 3]);
    battle.jeepSpawned = battle.wave;
    battle.jeeps = [];
    battle.landingCraft.forEach((c) => (c.gunnerHealth = 0));
    for (
      let i = 0;
      i < 1200 && !battle.soldiers.some((s) => s.phase === 'cover');
      i++
    )
      stepPillbox(battle, 0.025, false);
    assert.equal(battle.spawned, WAVE_COUNTS[0]);
    assert.ok(battle.soldiers.some((soldier) => soldier.phase === 'cover'));
    assert.ok(
      battle.soldiers.some((soldier) => soldier.z === COVER_ROWS[0] - 2.1),
    );
    advance(battle, 5);
    assert.ok(battle.soldiers.some((soldier) => soldier.coverIndex >= 1));
  });

  void test('cover blocks aimed rounds, then exposed soldiers take one or two rounds', () => {
    const battle = createPillboxBattle();
    battle.status = 'playing';
    firstLanding(battle);
    battle.spawnTimer = 100;
    for (let i = 0; i < 1000 && battle.soldiers[0].phase !== 'cover'; i++)
      stepPillbox(battle, 0.05, false);
    const soldier = battle.soldiers[0];
    assert.equal(soldier.phase, 'cover');
    aimPillbox(battle, soldier.x, soldier.z);
    const blocked = stepPillbox(battle, 0.01, true);
    assert.equal(blocked.find((event) => event.type === 'shot')?.hit, false);
    assert.match(battle.message, /cover/i);

    soldier.phase = 'advance';
    soldier.coverIndex = 1;
    soldier.health = 2;
    battle.cooldown = 0;
    aimPillbox(battle, soldier.x + 1, soldier.z);
    stepPillbox(battle, 0.01, true);
    assert.equal(soldier.health, 1);
    battle.cooldown = 0;
    aimPillbox(battle, soldier.x, soldier.z);
    const down = stepPillbox(battle, 0.01, true);
    assert.equal(soldier.phase, 'down');
    assert.ok(down.some((event) => event.type === 'down'));
  });

  void test('automatic fire overheats and remains locked until cooled to 30', () => {
    const battle = createPillboxBattle();
    battle.status = 'playing';
    battle.spawnTimer = 100;
    advance(battle, 3, true);
    assert.equal(battle.overheated, false);
    assert.ok(battle.shots >= 24);
    const events = stepPillbox(battle, 2, true);
    assert.equal(battle.shots, 35);
    assert.equal(battle.heat, 100);
    assert.equal(battle.overheated, true);
    assert.ok(events.some((event) => event.type === 'overheat'));
    const shots = battle.shots;
    stepPillbox(battle, 2, true);
    assert.equal(battle.shots, shots);
    assert.equal(battle.overheated, true);
    stepPillbox(battle, 0.5, false);
    assert.equal(battle.overheated, false);
  });

  void test('ready, paused, won, and lost states freeze and retry is clean', () => {
    for (const status of [
      'ready',
      'paused',
      'resupply',
      'won',
      'lost',
    ] as const) {
      const battle = createPillboxBattle();
      battle.status = status;
      const snapshot = structuredClone(battle);
      assert.deepEqual(stepPillbox(battle, 1, true), []);
      assert.deepEqual(battle, snapshot);
    }
    const retry = createPillboxBattle();
    assert.deepEqual(retry, createPillboxBattle());
  });

  void test('five breaches deal 20 each and cause defeat', () => {
    const battle = createPillboxBattle();
    battle.status = 'playing';
    advance(battle, 13);
    for (const soldier of battle.soldiers.slice(0, 5)) {
      soldier.phase = 'advance';
      delete soldier.landingCraftId;
      soldier.coverIndex = COVER_ROWS.length;
      soldier.z = -12;
    }
    stepPillbox(battle, 0.01, false);
    assert.equal(battle.health, 0);
    assert.equal(battle.status, 'lost');
  });

  void test('infantry routes clear every obstacle, stop behind cover, then converge', () => {
    for (let lane = 0; lane < 5; lane++)
      for (const offset of [-1.1, 0, 1.1]) {
        const route = infantryRoute(lane, offset);
        let previous = { x: [-36, -18, 0, 18, 36][lane] + offset, z: -132 };
        for (const point of route) {
          assert.ok(
            clearSegment(previous, point),
            `Blocked route in lane ${lane}`,
          );
          previous = point;
        }
        assert.deepEqual(
          route.filter((p) => p.cover).map((p) => p.z),
          COVER_ROWS.map((z) => z - 2.1),
        );
        assert.ok(Math.abs(route.at(-1)!.x) < 1);
      }
    const battle = createPillboxBattle();
    battle.status = 'playing';
    firstLanding(battle);
    battle.spawnTimer = 100;
    const soldier = battle.soldiers[0];
    battle.jeepSpawned = battle.wave;
    battle.jeeps = [];
    for (let i = 0; i < 2000 && soldier.phase !== 'breached'; i++) {
      const before = { x: soldier.x, z: soldier.z };
      stepPillbox(battle, 0.05, false);
      assert.ok(
        Math.hypot(soldier.x - before.x, soldier.z - before.z) <=
          soldier.speed * 1.25 * 0.05 + 1e-6,
      );
      for (const o of BEACH_OBSTACLES)
        assert.ok(
          Math.abs(soldier.x - o.x) >= o.halfX + 0.69 ||
            Math.abs(soldier.z - o.z) >= o.halfZ + 0.69,
        );
    }
    assert.equal(soldier.phase, 'breached');
    assert.equal(soldier.coverIndex, 2);
  });

  void test('squads create a denser beach and allow time to aim', () => {
    const battle = createPillboxBattle();
    battle.status = 'playing';
    firstLanding(battle);
    advance(battle, 8);
    assert.ok(battle.soldiers.length >= 12);
    assert.ok(battle.soldiers.every((s) => s.z < -98));
    assert.ok(battle.health >= 85);
  });

  void test('wins the full three-wave encounter through heat-aware aimed fire', () => {
    const battle = createPillboxBattle();
    battle.status = 'playing';
    let sawVictory = false;
    let cooling = false;

    for (
      let ticks = 0;
      ticks < 8_000 &&
      (battle.status === 'playing' || battle.status === 'resupply');
      ticks += 1
    ) {
      if (['resupply'].includes(battle.status)) {
        chooseSupplies(battle, 'repair');
        cooling = false;
      }
      const gunner = battle.landingCraft.find(
        (c) =>
          c.gunnerHealth > 0 &&
          c.phase !== 'gone' &&
          c.phase !== 'withdrawing' &&
          c.z >= -205,
      );
      const target =
        battle.jeeps.find(
          (j) => j.phase === 'driving' || j.phase === 'unloading',
        ) ??
        (gunner ? { x: gunner.x - 1.3, z: gunner.z - 4.5 } : undefined) ??
        battle.soldiers
          .filter(
            (s) =>
              (s.phase === 'advance' || s.exposed) &&
              !terrainBlocksShot(
                s.x,
                s.z,
                s.exposed ? 2.8 : s.crawling ? 0.55 : 1.7,
              ),
          )
          .sort((a, b) => b.z - a.z)[0];
      if (target) aimPillbox(battle, target.x, target.z);

      if (battle.heat >= 84 || battle.overheated) cooling = true;
      if (cooling && battle.heat <= 35 && !battle.overheated) cooling = false;
      const events = stepPillbox(battle, 0.05, Boolean(target) && !cooling);
      sawVictory ||= events.some((event) => event.type === 'won');
    }

    assert.equal(battle.status, 'won');
    assert.equal(
      battle.kills,
      WAVE_COUNTS.reduce((sum, n) => sum + n, 0),
    );
    assert.ok(battle.health >= 50);
    assert.equal(sawVictory, true);
    assert.equal(battle.vehiclesStopped, 6);
    assert.ok(
      battle.soldiers.filter((soldier) => soldier.phase === 'down').length <=
        18,
    );
  });
});
