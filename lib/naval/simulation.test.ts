import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  MAX_HEADING,
  MAX_RANGE,
  MIN_HEADING,
  MIN_RANGE,
  RELOAD_SECONDS,
  createBattle,
  fire,
  rangeToElevation,
  setAim,
  shellPosition,
  step,
  type Battle,
  type BattleEvent,
  type EnemyShip,
} from './simulation';

const FIXED_STEP = 1 / 60;

function advance(
  state: Battle,
  seconds: number,
  dt = FIXED_STEP,
): BattleEvent[] {
  const events: BattleEvent[] = [];
  let elapsed = 0;
  while (elapsed + 1e-10 < seconds && state.status === 'playing') {
    const slice = Math.min(dt, seconds - elapsed);
    events.push(...step(state, slice));
    elapsed += slice;
  }
  return events;
}

function aimAt(state: Battle, ship: EnemyShip): void {
  setAim(
    state,
    (Math.atan2(ship.x, -ship.z) * 180) / Math.PI,
    Math.hypot(ship.x, ship.z),
  );
}

function fireAt(state: Battle, ship: EnemyShip): BattleEvent[] {
  if (state.reload > 0) advance(state, state.reload + FIXED_STEP);
  aimAt(state, ship);
  assert.equal(fire(state), true);
  const shell = state.shells.at(-1);
  assert.ok(shell);
  return advance(state, shell.duration + FIXED_STEP);
}

void describe('naval combat simulation', () => {
  void test('creates three independent targets and clamps aim to combat bounds', () => {
    const battle = createBattle();
    assert.equal(battle.status, 'ready');
    assert.equal(battle.ships.length, 3);
    assert.deepEqual(
      battle.ships.map((ship) => [ship.health, ship.length, ship.width]),
      [
        [100, 95, 20],
        [100, 125, 22],
        [150, 150, 25],
      ],
    );

    setAim(battle, -100, 10);
    assert.equal(battle.heading, MIN_HEADING);
    assert.equal(battle.range, MIN_RANGE);
    setAim(battle, 100, 5000);
    assert.equal(battle.heading, MAX_HEADING);
    assert.equal(battle.range, MAX_RANGE);

    const restarted = createBattle();
    restarted.ships[0].health = 0;
    assert.equal(
      battle.ships[0].health,
      100,
      'new battles must not share ship objects',
    );
  });

  void test('maps range to elevation and lands a shell exactly at its aimed range', () => {
    assert.equal(rangeToElevation(MIN_RANGE), 8);
    assert.equal(rangeToElevation(MAX_RANGE), 38);
    assert.ok(rangeToElevation(900) > rangeToElevation(500));

    const battle = createBattle();
    battle.status = 'playing';
    setAim(battle, 30, 1200);
    assert.equal(fire(battle), true);
    const shell = battle.shells[0];
    const launch = shellPosition(shell);
    assert.deepEqual(launch, { x: 0, y: 0, z: 0 });

    shell.age = shell.duration / 2;
    assert.ok(
      shellPosition(shell).y > 100,
      'the visible trajectory should have a high midpoint',
    );
    shell.age = shell.duration;
    const impact = shellPosition(shell);
    assert.ok(Math.abs(Math.hypot(impact.x, impact.z) - 1200) < 1e-9);
    assert.ok(Math.abs(impact.x - 600) < 1e-9);
    assert.ok(Math.abs(impact.z + 1200 * Math.cos(Math.PI / 6)) < 1e-9);
    assert.ok(Math.abs(impact.y) < 1e-9);
  });

  void test('enforces reload and reports player launch through the step event stream', () => {
    const battle = createBattle();
    battle.status = 'playing';
    assert.equal(fire(battle), true);
    assert.equal(battle.reload, RELOAD_SECONDS);
    assert.equal(fire(battle), false);

    const firstTick = step(battle, FIXED_STEP);
    assert.deepEqual(firstTick[0], {
      type: 'fired',
      shellId: 'player-1',
      enemy: false,
    });
    advance(battle, RELOAD_SECONDS - FIXED_STEP * 2);
    assert.equal(fire(battle), false);
    advance(battle, FIXED_STEP * 2);
    assert.equal(battle.reload, 0);
    assert.equal(fire(battle), true);
  });

  void test('reports short and lateral correction relative to the nearest living target', () => {
    const shortBattle = createBattle();
    shortBattle.status = 'playing';
    setAim(shortBattle, -20, 350);
    assert.equal(fire(shortBattle), true);
    const shortEvents = advance(shortBattle, 2);
    assert.ok(
      shortEvents.some(
        (event) =>
          event.type === 'miss' &&
          event.shipId === 'corsair' &&
          event.shortLong === 'short' &&
          event.lateral === 'center',
      ),
    );

    const lateralBattle = createBattle();
    lateralBattle.status = 'playing';
    setAim(lateralBattle, -10, 550);
    assert.equal(fire(lateralBattle), true);
    const lateralEvents = advance(lateralBattle, 2);
    assert.ok(
      lateralEvents.some(
        (event) =>
          event.type === 'miss' &&
          event.shipId === 'corsair' &&
          event.shortLong === 'on-range' &&
          event.lateral === 'right',
      ),
    );

    const longBattle = createBattle();
    longBattle.status = 'playing';
    setAim(longBattle, -20, 700);
    assert.equal(fire(longBattle), true);
    const longEvents = advance(longBattle, 2);
    assert.ok(
      longEvents.some(
        (event) =>
          event.type === 'miss' &&
          event.shipId === 'corsair' &&
          event.shortLong === 'long',
      ),
    );
  });

  void test('applies damage, counts hits, and sinks ships after two or three hits', () => {
    const battle = createBattle();
    battle.status = 'playing';
    const corsair = battle.ships[0];

    const firstEvents = fireAt(battle, corsair);
    assert.equal(corsair.health, 50);
    assert.equal(battle.hits, 1);
    assert.ok(
      firstEvents.some(
        (event) => event.type === 'hit' && event.shipId === corsair.id,
      ),
    );

    const secondEvents = fireAt(battle, corsair);
    assert.equal(corsair.health, 0);
    assert.equal(battle.hits, 2);
    assert.ok(
      secondEvents.some(
        (event) => event.type === 'sunk' && event.shipId === corsair.id,
      ),
    );
    assert.equal(battle.score, 450);
  });

  void test('wins only after every ship has been sunk', () => {
    const battle = createBattle();
    battle.status = 'playing';
    let finalEvents: BattleEvent[] = [];

    for (const ship of battle.ships) {
      const hitsNeeded = Math.ceil(ship.maxHealth / 50);
      for (let hit = 0; hit < hitsNeeded; hit += 1) {
        finalEvents = fireAt(battle, ship);
      }
    }

    assert.equal(battle.status, 'won');
    assert.equal(battle.hits, 7);
    assert.equal(battle.shots, 7);
    assert.ok(finalEvents.some((event) => event.type === 'won'));
    assert.ok(battle.ships.every((ship) => ship.health === 0));
  });

  void test('enemy shells telegraph their arrival and cause deterministic defeat', () => {
    const battle = createBattle();
    battle.status = 'playing';
    const warningEvents = advance(battle, 10.1);

    assert.ok(warningEvents.some((event) => event.type === 'enemy-fired'));
    assert.ok(!warningEvents.some((event) => event.type === 'damaged'));
    assert.equal(battle.health, 100);
    assert.ok(battle.shells.some((shell) => shell.enemy));

    const events = advance(battle, 79.9);

    assert.ok(events.some((event) => event.type === 'damaged'));
    assert.ok(events.some((event) => event.type === 'lost'));
    assert.equal(battle.status, 'lost');
    assert.equal(battle.health, 0);
    assert.ok(battle.time >= 60 && battle.time <= 90);
  });

  void test('freezes ready, paused, and terminal battles and restarts from clean state', () => {
    const ready = createBattle();
    const readySnapshot = structuredClone(ready);
    assert.deepEqual(step(ready, FIXED_STEP), []);
    assert.deepEqual(ready, readySnapshot);
    assert.equal(fire(ready), false);

    ready.status = 'playing';
    advance(ready, 1);
    ready.status = 'paused';
    const pausedSnapshot = structuredClone(ready);
    assert.deepEqual(step(ready, 0.25), []);
    assert.deepEqual(ready, pausedSnapshot);
    assert.equal(fire(ready), false);

    ready.status = 'lost';
    const lostSnapshot = structuredClone(ready);
    assert.deepEqual(step(ready, 0.25), []);
    assert.deepEqual(ready, lostSnapshot);

    const restarted = createBattle();
    assert.equal(restarted.status, 'ready');
    assert.equal(restarted.time, 0);
    assert.equal(restarted.health, 100);
    assert.equal(restarted.shots, 0);
    assert.equal(restarted.shells.length, 0);
    assert.ok(restarted.ships.every((ship) => ship.health === ship.maxHealth));
  });

  void test('fixed-size stepping gives stable time, reload, and constant-velocity movement', () => {
    const smallSteps = createBattle();
    const quarterSteps = createBattle();
    smallSteps.status = 'playing';
    quarterSteps.status = 'playing';
    smallSteps.ships.forEach((ship) => (ship.nextFire = 1000));
    quarterSteps.ships.forEach((ship) => (ship.nextFire = 1000));
    fire(smallSteps);
    fire(quarterSteps);

    advance(smallSteps, 1, FIXED_STEP);
    advance(quarterSteps, 1, 0.25);

    assert.ok(Math.abs(smallSteps.time - quarterSteps.time) < 1e-9);
    assert.ok(Math.abs(smallSteps.reload - quarterSteps.reload) < 1e-9);
    for (let index = 0; index < smallSteps.ships.length; index += 1) {
      assert.ok(
        Math.abs(smallSteps.ships[index].x - quarterSteps.ships[index].x) <
          1e-9,
      );
      assert.ok(
        Math.abs(smallSteps.ships[index].z - quarterSteps.ships[index].z) <
          1e-9,
      );
    }
    assert.deepEqual(
      shellPosition(smallSteps.shells[0]),
      shellPosition(quarterSteps.shells[0]),
    );
  });
});
