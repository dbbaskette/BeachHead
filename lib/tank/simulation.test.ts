import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTank,
  stepTank,
  emptyTankInput,
  aimTank,
  damagePlayer,
  segmentBox,
  type TankState,
  type TankInput,
} from './simulation';
import { FlakControls } from '../flak/controls';
const active = () => {
  const s = createTank();
  s.status = 'playing';
  return s;
};
function advance(
  s: TankState,
  seconds: number,
  input: Partial<TankInput> = {},
) {
  for (let t = 0; t < seconds; t += 1 / 60)
    stepTank(s, 1 / 60, { ...emptyTankInput(), ...input });
}
function aimAt(s: TankState, x: number, y: number, z: number) {
  const d = Math.hypot(x - s.x, z - s.z);
  s.turret = Math.atan2(x - s.x, -(z - s.z));
  s.pitch = Math.atan2(y - 2.65 + 0.5 * 9.81 * (d / 260) ** 2, d - 4.25);
}
void test('independent hull steering and turret aiming, inertia, and pause/retry', () => {
  const s = active();
  advance(s, 2, { drive: 1, steer: 0.4 });
  assert.ok(s.z < 16 && s.x > 0);
  assert.equal(s.turret, 0);
  const yaw = s.yaw;
  aimTank(s, 0.5, 0.02);
  assert.equal(s.yaw, yaw);
  assert.equal(s.turret, 0.5);
  advance(s, 2);
  assert.ok(Math.abs(s.speed) < 0.02);
  s.status = 'paused';
  const before = structuredClone(s);
  before.events = [];
  advance(s, 1, { drive: 1, fire: true });
  assert.deepEqual(s, before);
  assert.equal(createTank().distance, 0);
});
void test('swept shell intersection detects thin cover and rejects misses', () => {
  assert.ok(
    Math.abs(
      segmentBox(
        { x: 0, y: 1, z: 5 },
        { x: 0, y: 1, z: -5 },
        { x: 0, y: 1, z: 0 },
        { x: 2, y: 1, z: 0.1 },
      )! - 0.49,
    ) < 1e-9,
  );
  assert.equal(
    segmentBox(
      { x: 3, y: 1, z: 5 },
      { x: 3, y: 1, z: -5 },
      { x: 0, y: 1, z: 0 },
      { x: 2, y: 1, z: 0.1 },
    ),
    null,
  );
});
void test('cannon destroys a wall before it can hit enemies behind it', () => {
  const s = active();
  s.cover = s.cover.filter((c) => c.kind === 'wall').slice(0, 1);
  const wall = s.cover[0];
  wall.x = 0;
  wall.z = -15;
  wall.y = 1.5;
  wall.h = 3;
  s.enemies = s.enemies.filter((e, i) => i === 0 || e.kind === 'demolition');
  const enemy = s.enemies[0];
  enemy.x = 0;
  enemy.y = 1;
  enemy.z = -23;
  enemy.cooldown = 999;
  aimAt(s, 0, 1, -23);
  advance(s, 0.6, { fire: true });
  assert.ok(wall.health <= 0);
  assert.equal(enemy.health, 32);
  advance(s, 3.7, { fire: true });
  assert.ok(enemy.health <= 0);
});
void test('MG is useful against infantry but cannot penetrate tank armor', () => {
  const s = active();
  s.cover = [];
  s.weapon = 'mg';
  s.enemies = s.enemies.filter(
    (e) => e.kind === 'tank' || e.kind === 'demolition',
  );
  const tank = s.enemies[0];
  tank.x = 0;
  tank.z = -30;
  tank.cooldown = 999;
  const hp = tank.health;
  aimAt(s, 0, 1.7, -30);
  advance(s, 2, { fire: true });
  assert.equal(tank.health, hp);
  assert.ok(s.heat > 0);
  assert.ok(s.shells.length < 30);
  const infantry = active();
  infantry.cover = [];
  infantry.weapon = 'mg';
  infantry.enemies = infantry.enemies.filter(
    (e, i) => i === 0 || e.kind === 'demolition',
  );
  Object.assign(infantry.enemies[0], { x: 0, y: 1, z: -25, cooldown: 999 });
  aimAt(infantry, 0, 1, -25);
  advance(infantry, 1, { fire: true });
  assert.ok(infantry.enemies[0].health <= 0);
});
void test('front armor reduces damage, side rockets damage tracks, stationary repair is interruptible', () => {
  const front = active(),
    side = active();
  damagePlayer(front, 30, { x: 0, y: 1, z: -30 }, 'gun');
  damagePlayer(side, 30, { x: 30, y: 1, z: 18 }, 'rocket');
  assert.ok(front.health > side.health);
  assert.equal(side.track, 1);
  advance(side, 2, { repair: true });
  assert.ok(side.repair >= 2);
  advance(side, 0.1, { drive: 1, repair: true });
  assert.equal(side.repair, 0);
  advance(side, 5, { repair: true });
  assert.equal(side.track, 0);
  damagePlayer(side, 20, { x: 30, y: 1, z: 18 }, 'tank');
  assert.equal(side.turretDamage, 1);
  const yaw = side.turret;
  aimTank(side, 1, 0);
  assert.ok(side.turret - yaw < 0.5);
});
void test('ambush gives warning before a ballistic shot and a killed crew cannot shoot', () => {
  const s = active();
  s.cover = [];
  s.enemies = s.enemies.filter((e, i) => i === 0 || e.kind === 'demolition');
  Object.assign(s.enemies[0], { x: 10, y: 2, z: -30, cooldown: 0 });
  advance(s, 0.1);
  assert.ok(s.enemies[0].warning > 2);
  assert.equal(s.shells.length, 0);
  advance(s, 2.4);
  assert.ok(s.shells.some((r) => r.enemy));
  const p = active();
  p.cover = [];
  p.enemies = p.enemies.filter((e, i) => i === 0 || e.kind === 'demolition');
  Object.assign(p.enemies[0], { x: 10, y: 2, z: -30, cooldown: 0 });
  advance(p, 0.1);
  p.enemies[0].health = 0;
  advance(p, 4);
  assert.equal(p.shells.length, 0);
});
void test('both routes are traversable and the tank crushes fences instead of passing through houses', () => {
  for (const x of [0, -44]) {
    const s = active();
    s.x = x;
    s.enemies.forEach((e) => (e.active = false));
    advance(s, 65, { drive: 1 });
    assert.ok(s.z < -275, `${x}: ${s.z}`);
    if (x === -44)
      assert.ok(
        s.cover.filter((c) => c.kind === 'fence').every((c) => c.health <= 0),
      );
  }
  const s = active();
  s.x = 25;
  s.enemies.forEach((e) => (e.active = false));
  advance(s, 20, { drive: 1 });
  assert.ok(s.z > -39);
});
void test('bridge water blocks off-road crossing, repair supply is consumed once', () => {
  const s = active();
  s.cover = [];
  s.enemies.forEach((e) => (e.active = false));
  s.x = 30;
  s.z = -304;
  advance(s, 5, { drive: 1 });
  assert.ok(s.z >= -310);
  const p = active();
  p.x = -43;
  p.z = -172;
  p.health = 50;
  advance(p, 0.1);
  assert.equal(p.health, 85);
  assert.equal(p.supplied, true);
  p.health = 60;
  advance(p, 0.1);
  assert.equal(p.health, 60);
});
void test('destroying the demolition post, reaching the square and clearing the holdout wins', () => {
  const s = active();
  s.x = 0;
  s.z = -287;
  s.cover = [];
  // Test the objective through actual gunfire, isolated from unrelated ambushes.
  s.enemies = s.enemies.filter((e) => e.kind === 'demolition' || e.reserve);
  const post = s.enemies[0];
  aimAt(s, post.x, post.y, post.z);
  advance(s, 5, { fire: true });
  assert.ok(post.health <= 0);
  assert.equal(s.phase, 'hold');
  assert.ok(s.enemies.filter((e) => e.reserve).every((e) => e.active));
  for (const e of s.enemies.filter((e) => e.reserve)) {
    aimAt(s, e.x, e.y, e.z);
    advance(s, 8, { fire: true });
  }
  advance(s, 42, { repair: true });
  assert.equal(s.status, 'won');
  assert.ok(s.health > 0);
});
void test('demolition countdown and tank destruction lose; departing the square stops hold progress', () => {
  const s = active();
  s.z = -120;
  s.enemies.forEach((e) => (e.active = false));
  s.demolition = 0.1;
  advance(s, 0.2);
  assert.equal(s.status, 'lost');
  assert.match(s.reason, /bridge/);
  const p = active();
  p.health = 0;
  advance(p, 0.1);
  assert.equal(p.status, 'lost');
  const h = active();
  h.phase = 'hold';
  h.hold = 10;
  advance(h, 2);
  assert.equal(h.hold, 10);
});
void test('mobile drive, turret and fire fingers release independently including brief taps', () => {
  const c = new FlakControls();
  c.begin('move', 1, 0, 0, 'touch');
  c.begin('turn', 2, 100, 100, 'touch');
  c.begin('fire', 3, 200, 100, 'touch');
  c.move(1, 0, -40);
  c.move(2, 130, 100);
  assert.ok(c.axis.y < 0 && c.turn.x > 0 && c.takeFire());
  c.end(3);
  assert.equal(c.takeFire(), false);
  assert.ok(c.axis.y < 0);
  c.end(1);
  assert.equal(c.axis.y, 0);
  assert.ok(c.turn.x > 0);
  c.end(2);
  assert.equal(c.turn.x, 0);
  c.begin('fire', 4, 0, 0, 'touch');
  c.end(4);
  assert.equal(c.takeFire(), true);
  assert.equal(c.takeFire(), false);
  c.clear();
  assert.equal(c.firing, false);
});
void test('a complete high-street breakout can be won using driving, aiming, firing and repairs', () => {
  const s = active();
  let maxShells = 0;
  for (let i = 0; i < 8 * 60 * 60 && s.status === 'playing'; i++) {
    const target = s.enemies
      .filter((e) => e.active && e.health > 0)
      .sort(
        (a, b) =>
          Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z),
      )[0];
    const input = emptyTankInput();
    if (s.track || s.turretDamage) input.repair = true;
    else if (target && Math.hypot(target.x - s.x, target.z - s.z) < 115) {
      aimAt(s, target.x, target.y, target.z);
      input.fire = true;
    } else if (s.z > -290) input.drive = 1;
    stepTank(s, 1 / 60, input);
    maxShells = Math.max(maxShells, s.shells.length);
  }
  assert.equal(
    s.status,
    'won',
    `${s.reason}, health ${s.health}, z ${s.z}, kills ${s.kills}, time ${s.time}`,
  );
  assert.ok(s.health > 0);
  assert.ok(s.kills >= 9);
  assert.ok(maxShells < 80);
});
