import {
  createAircraft,
  fly,
  PASS_SECONDS,
  SPEED,
  CENTERS,
  distance,
} from './flight';
import {
  createTargets,
  updateTargets,
  damageTarget,
  bombBlast,
} from './targets';
import {
  firstSurface,
  gunSolutions,
  projectilePoint,
  releaseBomb,
} from './weapons';
import { NEUTRAL, type AirBattle, type AirEvent, type AirInput } from './types';
export function createAirBattle(): AirBattle {
  return {
    status: 'ready',
    phase: 'approach',
    pass: 0,
    phaseTime: 0,
    time: 0,
    aircraft: createAircraft(),
    health: 100,
    bombs: 6,
    released: 0,
    bombCooldown: 0,
    bombHeld: false,
    heat: 0,
    overheated: false,
    gunCooldown: 0,
    shots: 0,
    hits: 0,
    score: 0,
    destroyed: 0,
    deniedCargo: 0,
    targets: createTargets(),
    projectiles: [],
    flak: [],
    serial: 0,
    outcome: '',
    turnFrom: { x: 0, y: 0, z: 0 },
    turnHeading: 0,
  };
}
export function startAirBattle() {
  const b = createAirBattle();
  b.status = 'playing';
  return b;
}
export function stepAir(
  b: AirBattle,
  input: AirInput = NEUTRAL,
  dt = 1 / 60,
): AirEvent[] {
  const events: AirEvent[] = [];
  if (b.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return events;
  dt = Math.min(dt, 0.05);
  b.time += dt;
  b.phaseTime += dt;
  fly(b, input, dt);
  updateTargets(b, dt);
  b.bombCooldown = Math.max(0, b.bombCooldown - dt);
  b.gunCooldown = Math.max(0, b.gunCooldown - dt);
  const pressed = input.bomb && !b.bombHeld;
  b.bombHeld = input.bomb;
  if (pressed) {
    const p = releaseBomb(b);
    if (p) events.push({ type: 'bomb-release', position: { ...p.origin } });
  }
  const firing = b.phase === 'attack' && input.fire && !b.overheated;
  if (firing && b.gunCooldown === 0) {
    const solutions = gunSolutions(b.aircraft);
    b.gunCooldown = 0.12;
    b.heat = Math.min(100, b.heat + 4.7);
    b.shots += 2;
    for (const s of solutions)
      b.projectiles.push({
        ...s,
        id: ++b.serial,
        position: { ...s.origin },
        kind: 'gun',
        age: 0,
        life: 2,
        rack: 0,
      });
    events.push({ type: 'guns', points: solutions.map((s) => s.origin) });
    if (b.heat >= 100) b.overheated = true;
  }
  if (!firing) b.heat = Math.max(0, b.heat - dt * 22);
  if (b.overheated && b.heat <= 32) b.overheated = false;
  // Targets have advanced this tick. Rewind their centers for relative sweep.
  const targets = b.targets.map((t) => ({
    ...t,
    position: {
      x: t.position.x - t.velocity.x * dt,
      y: t.position.y,
      z: t.position.z - t.velocity.z * dt,
    },
  }));
  for (let i = b.projectiles.length - 1; i >= 0; i--) {
    const p = b.projectiles[i],
      previous = p.position;
    p.age += dt;
    p.position = projectilePoint(p, p.age);
    const hit = firstSurface(previous, p.position, targets, dt, dt);
    if (hit) {
      if (p.kind === 'bomb') bombBlast(b, hit.position, events);
      else if (hit.target) {
        const target = b.targets.find((t) => t.id === hit.target!.id)!;
        damageTarget(b, target, 4.4, events, hit.position);
        b.hits++;
      }
      events.push({
        type: 'impact',
        position: hit.position,
        water: hit.water,
        bomb: p.kind === 'bomb',
      });
    }
    if (hit || p.age >= p.life) b.projectiles.splice(i, 1);
  }
  // Commit flak to a fixed predicted point; evasion after launch defeats its lead.
  if (b.phase === 'attack' || b.phase === 'exit')
    for (const t of b.targets) {
      if (
        t.kind !== 'flak' ||
        !t.active ||
        t.health <= 0 ||
        b.time < t.nextFire ||
        distance(t.position, b.aircraft.position) > 1000
      )
        continue;
      t.nextFire = b.time + 6.8;
      const fuse = 2.35,
        f = b.aircraft;
      const end = {
        x: f.position.x + f.velocity.x * fuse,
        y: f.position.y + f.velocity.y * fuse,
        z: f.position.z + f.velocity.z * fuse,
      };
      const origin = { ...t.position, y: t.position.y + 5 };
      b.flak.push({
        id: ++b.serial,
        origin,
        end,
        position: { ...origin },
        age: 0,
        fuse,
      });
      events.push({ type: 'flak', position: origin });
    }
  for (let i = b.flak.length - 1; i >= 0; i--) {
    const f = b.flak[i];
    f.age += dt;
    const t = Math.min(1, f.age / f.fuse);
    f.position = {
      x: f.origin.x + (f.end.x - f.origin.x) * t,
      y: f.origin.y + (f.end.y - f.origin.y) * t,
      z: f.origin.z + (f.end.z - f.origin.z) * t,
    };
    if (f.age >= f.fuse) {
      events.push({ type: 'flak-burst', position: { ...f.end } });
      const d = distance(f.end, b.aircraft.position);
      if (d < 25) {
        const amount = 10 * (1 - d / 55);
        b.health = Math.max(0, b.health - amount);
        events.push({ type: 'damage', amount });
      }
      b.flak.splice(i, 1);
    }
  }
  if (b.health <= 0) {
    b.status = 'lost';
    b.outcome =
      'Aircraft lost. Bank after a flak shot launches, or silence the shore batteries early.';
    return events;
  }
  if (b.phase === 'approach' && b.phaseTime >= 6) {
    b.phase = 'attack';
    b.phaseTime = 0;
    events.push({ type: 'phase' });
  } else if (b.phase === 'attack' && b.phaseTime >= PASS_SECONDS) {
    b.phase = b.pass < 2 ? 'turn' : 'exit';
    b.phaseTime = 0;
    b.turnFrom = { ...b.aircraft.position };
    b.turnHeading = b.pass === 1 ? Math.PI : 0;
    events.push({ type: 'phase' });
  } else if (b.phase === 'turn' && b.phaseTime >= 6) {
    b.pass++;
    b.phase = 'attack';
    b.phaseTime = 0;
    const f = b.aircraft;
    f.offset = f.desiredOffset = f.lateralSpeed = 0;
    f.desiredAltitude = 85;
    f.position = { x: CENTERS[b.pass], y: 85, z: b.pass === 1 ? -1300 : 1300 };
    f.heading = b.pass === 1 ? Math.PI : Math.PI * 2;
    f.velocity = { x: 0, y: 0, z: b.pass === 1 ? SPEED : -SPEED };
    f.pitch = f.bank = 0;
    if (b.pass === 2)
      b.targets.find((t) => t.kind === 'command')!.active = true;
    events.push({ type: 'phase' });
  } else if (
    b.phase === 'exit' &&
    b.phaseTime >= 8 &&
    !b.projectiles.some((p) => p.kind === 'bomb')
  ) {
    const success = b.targets.find((t) => t.kind === 'command')!.health <= 0;
    b.status = success ? 'won' : 'lost';
    b.outcome = success
      ? 'Command transport destroyed. You brought the aircraft home. The landing is broken.'
      : 'The command transport escaped. Save bombs for the striped transport on the final pass.';
  }
  return events;
}
