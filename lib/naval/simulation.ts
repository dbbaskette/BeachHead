export type BattleStatus = 'ready' | 'playing' | 'paused' | 'won' | 'lost';

export interface EnemyShip {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Model yaw in radians. Zero points forward along world -z. */
  heading: number;
  health: number;
  maxHealth: number;
  length: number;
  width: number;
  /** Seconds until this ship launches its next shell. */
  nextFire: number;
  speed: number;
}

export interface Shell {
  id: string;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  age: number;
  duration: number;
  enemy: boolean;
  targetShipId?: string;
}

export interface Battle {
  status: BattleStatus;
  time: number;
  heading: number;
  range: number;
  /** Seconds remaining before the player can fire. */
  reload: number;
  health: number;
  score: number;
  shots: number;
  hits: number;
  ships: EnemyShip[];
  shells: Shell[];
  message: string;
}

export type BattleEvent =
  | { type: 'fired'; shellId: string; enemy: false }
  | { type: 'hit'; shipId: string; damage: number }
  | {
      type: 'miss';
      shipId?: string;
      x: number;
      z: number;
      shortLong: 'short' | 'long' | 'on-range';
      lateral: 'left' | 'right' | 'center';
    }
  | { type: 'enemy-fired'; shellId: string; shipId: string }
  | { type: 'damaged'; damage: number }
  | { type: 'sunk'; shipId: string }
  | { type: 'won' }
  | { type: 'lost' }
  | { type: 'message'; message: string };

export interface ShellPoint {
  x: number;
  y: number;
  z: number;
}

export const MIN_HEADING = -55;
export const MAX_HEADING = 55;
export const MIN_RANGE = 250;
export const MAX_RANGE = 1600;
export const RELOAD_SECONDS = 2.2;

const PLAYER_SHELL_DAMAGE = 50;
const ENEMY_SHELL_DAMAGE = 12;
const IMPACT_PADDING = 4;

interface ShipDefinition {
  id: string;
  name: string;
  bearing: number;
  range: number;
  heading: number;
  health: number;
  length: number;
  width: number;
  nextFire: number;
  speed: number;
}

const SHIP_DEFINITIONS: readonly ShipDefinition[] = [
  {
    id: 'corsair',
    name: 'Corsair',
    bearing: -20,
    range: 550,
    heading: 90,
    health: 100,
    length: 95,
    width: 20,
    nextFire: 10,
    speed: 1.6,
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    bearing: 0,
    range: 820,
    heading: -90,
    health: 100,
    length: 125,
    width: 22,
    nextFire: 15,
    speed: 1.3,
  },
  {
    id: 'leviathan',
    name: 'Leviathan',
    bearing: 23,
    range: 1100,
    heading: 90,
    health: 150,
    length: 150,
    width: 25,
    nextFire: 20,
    speed: 1.1,
  },
];

const ENEMY_FIRE_INTERVAL: Readonly<Record<string, number>> = {
  corsair: 20,
  vanguard: 22,
  leviathan: 24,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function polarPosition(
  heading: number,
  range: number,
): { x: number; z: number } {
  const radians = degreesToRadians(heading);
  return {
    x: Math.sin(radians) * range,
    z: -Math.cos(radians) * range,
  };
}

function distance(x1: number, z1: number, x2: number, z2: number): number {
  return Math.hypot(x2 - x1, z2 - z1);
}

function playerShellDuration(range: number): number {
  return 1.5 + ((range - MIN_RANGE) / (MAX_RANGE - MIN_RANGE)) * 1;
}

function enemyShellDuration(range: number): number {
  return clamp(1.5 + range / 1200, 1.5, 2.5);
}

function createEnemyShip(definition: ShipDefinition): EnemyShip {
  const position = polarPosition(definition.bearing, definition.range);
  return {
    id: definition.id,
    name: definition.name,
    x: position.x,
    z: position.z,
    heading: degreesToRadians(definition.heading),
    health: definition.health,
    maxHealth: definition.health,
    length: definition.length,
    width: definition.width,
    nextFire: definition.nextFire,
    speed: definition.speed,
  };
}

export function createBattle(): Battle {
  return {
    status: 'ready',
    time: 0,
    heading: 0,
    range: 820,
    reload: 0,
    health: 100,
    score: 0,
    shots: 0,
    hits: 0,
    ships: SHIP_DEFINITIONS.map(createEnemyShip),
    shells: [],
    message: 'Set bearing and range, then open fire.',
  };
}

export function setAim(
  state: Battle,
  headingDegrees: number,
  rangeMeters: number,
): void {
  if (Number.isFinite(headingDegrees)) {
    state.heading = clamp(headingDegrees, MIN_HEADING, MAX_HEADING);
  }
  if (Number.isFinite(rangeMeters)) {
    state.range = clamp(rangeMeters, MIN_RANGE, MAX_RANGE);
  }
}

/** Returns a display elevation in degrees for the selected compressed range. */
export function rangeToElevation(range: number): number {
  const normalized =
    (clamp(range, MIN_RANGE, MAX_RANGE) - MIN_RANGE) / (MAX_RANGE - MIN_RANGE);
  return 8 + normalized * 30;
}

/** Returns the current point on a shell's exact launch-to-target arc. */
export function shellPosition(shell: Shell): ShellPoint {
  const progress = clamp(
    shell.duration > 0 ? shell.age / shell.duration : 1,
    0,
    1,
  );
  const range = distance(shell.x, shell.z, shell.targetX, shell.targetZ);
  return {
    x: shell.x + (shell.targetX - shell.x) * progress,
    y: Math.sin(Math.PI * progress) * (42 + range * 0.11),
    z: shell.z + (shell.targetZ - shell.z) * progress,
  };
}

export function fire(state: Battle): boolean {
  if (state.status !== 'playing' || state.reload > 0) {
    return false;
  }

  const target = polarPosition(state.heading, state.range);
  state.shots += 1;
  state.reload = RELOAD_SECONDS;
  state.shells.push({
    id: `player-${state.shots}`,
    x: 0,
    z: 0,
    targetX: target.x,
    targetZ: target.z,
    age: 0,
    duration: playerShellDuration(state.range),
    enemy: false,
  });
  state.message = 'Shot away.';
  return true;
}

function containsImpact(ship: EnemyShip, x: number, z: number): boolean {
  const dx = x - ship.x;
  const dz = z - ship.z;
  const forwardX = Math.sin(ship.heading);
  const forwardZ = -Math.cos(ship.heading);
  const rightX = Math.cos(ship.heading);
  const rightZ = Math.sin(ship.heading);
  const longitudinal = dx * forwardX + dz * forwardZ;
  const lateral = dx * rightX + dz * rightZ;
  return (
    Math.abs(longitudinal) <= ship.length / 2 + IMPACT_PADDING &&
    Math.abs(lateral) <= ship.width / 2 + IMPACT_PADDING
  );
}

function nearestAliveShip(
  state: Battle,
  x: number,
  z: number,
): EnemyShip | undefined {
  let nearest: EnemyShip | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const ship of state.ships) {
    if (ship.health <= 0) continue;
    const separation = distance(x, z, ship.x, ship.z);
    if (separation < nearestDistance) {
      nearest = ship;
      nearestDistance = separation;
    }
  }
  return nearest;
}

function missCorrection(
  ship: EnemyShip | undefined,
  x: number,
  z: number,
): Pick<Extract<BattleEvent, { type: 'miss' }>, 'shortLong' | 'lateral'> {
  if (!ship) return { shortLong: 'on-range', lateral: 'center' };

  const impactRange = Math.hypot(x, z);
  const shipRange = Math.hypot(ship.x, ship.z);
  const rangeTolerance = Math.max(12, ship.length * 0.12);
  const shortLong =
    impactRange < shipRange - rangeTolerance
      ? 'short'
      : impactRange > shipRange + rangeTolerance
        ? 'long'
        : 'on-range';

  const impactBearing = Math.atan2(x, -z);
  const shipBearing = Math.atan2(ship.x, -ship.z);
  const lateralDifference = impactBearing - shipBearing;
  const lateralTolerance = degreesToRadians(1.25);
  const lateral =
    lateralDifference < -lateralTolerance
      ? 'left'
      : lateralDifference > lateralTolerance
        ? 'right'
        : 'center';
  return { shortLong, lateral };
}

function describeMiss(
  ship: EnemyShip | undefined,
  correction: ReturnType<typeof missCorrection>,
): string {
  if (!ship) return 'Splash. No targets remain.';
  const rangeWords =
    correction.shortLong === 'on-range' ? 'Range good' : correction.shortLong;
  const lateralWords =
    correction.lateral === 'center'
      ? 'line good'
      : `${correction.lateral} of target`;
  return `${rangeWords}; ${lateralWords} on ${ship.name}.`;
}

function resolvePlayerImpact(
  state: Battle,
  shell: Shell,
  events: BattleEvent[],
): void {
  const hitShip = state.ships.find(
    (ship) =>
      ship.health > 0 && containsImpact(ship, shell.targetX, shell.targetZ),
  );

  if (!hitShip) {
    const nearest = nearestAliveShip(state, shell.targetX, shell.targetZ);
    const correction = missCorrection(nearest, shell.targetX, shell.targetZ);
    state.message = describeMiss(nearest, correction);
    events.push({
      type: 'miss',
      shipId: nearest?.id,
      x: shell.targetX,
      z: shell.targetZ,
      ...correction,
    });
    events.push({ type: 'message', message: state.message });
    return;
  }

  const wasAlive = hitShip.health > 0;
  hitShip.health = Math.max(0, hitShip.health - PLAYER_SHELL_DAMAGE);
  state.hits += 1;
  state.score += 100;
  events.push({ type: 'hit', shipId: hitShip.id, damage: PLAYER_SHELL_DAMAGE });

  if (wasAlive && hitShip.health === 0) {
    state.score += 250;
    state.message = `${hitShip.name} sunk.`;
    events.push({ type: 'sunk', shipId: hitShip.id });
  } else {
    state.message = `Hit on ${hitShip.name}.`;
  }
  events.push({ type: 'message', message: state.message });

  if (state.ships.every((ship) => ship.health === 0)) {
    state.status = 'won';
    state.message = 'Enemy squadron destroyed.';
    events.push({ type: 'won' });
    events.push({ type: 'message', message: state.message });
  }
}

function resolveEnemyImpact(state: Battle, events: BattleEvent[]): void {
  state.health = Math.max(0, state.health - ENEMY_SHELL_DAMAGE);
  state.message = `Incoming hit. Hull integrity ${state.health}%.`;
  events.push({ type: 'damaged', damage: ENEMY_SHELL_DAMAGE });
  events.push({ type: 'message', message: state.message });

  if (state.health === 0) {
    state.status = 'lost';
    state.message = 'Our ship is lost.';
    events.push({ type: 'lost' });
    events.push({ type: 'message', message: state.message });
  }
}

function moveShips(state: Battle, dtSeconds: number): void {
  for (const ship of state.ships) {
    if (ship.health <= 0) continue;
    ship.x += Math.sin(ship.heading) * ship.speed * dtSeconds;
    ship.z += -Math.cos(ship.heading) * ship.speed * dtSeconds;
  }
}

function updateShells(
  state: Battle,
  dtSeconds: number,
  events: BattleEvent[],
): void {
  for (const shell of state.shells) {
    if (!shell.enemy && shell.age === 0) {
      events.push({ type: 'fired', shellId: shell.id, enemy: false });
    }
    shell.age = Math.min(shell.duration, shell.age + dtSeconds);
  }

  const impacts = state.shells.filter((shell) => shell.age >= shell.duration);
  state.shells = state.shells.filter((shell) => shell.age < shell.duration);
  for (const shell of impacts) {
    if (state.status !== 'playing') break;
    if (shell.enemy) resolveEnemyImpact(state, events);
    else resolvePlayerImpact(state, shell, events);
  }
}

function launchEnemyShells(
  state: Battle,
  dtSeconds: number,
  events: BattleEvent[],
): void {
  for (const ship of state.ships) {
    if (ship.health <= 0) continue;
    ship.nextFire -= dtSeconds;
    if (ship.nextFire > 0) continue;

    const interval = ENEMY_FIRE_INTERVAL[ship.id] ?? 22;
    ship.nextFire += interval;
    const shellNumber = Math.round((state.time + ship.nextFire) * 1000);
    const shell: Shell = {
      id: `enemy-${ship.id}-${shellNumber}`,
      x: ship.x,
      z: ship.z,
      targetX: 0,
      targetZ: 0,
      age: 0,
      duration: enemyShellDuration(Math.hypot(ship.x, ship.z)),
      enemy: true,
      targetShipId: ship.id,
    };
    state.shells.push(shell);
    events.push({ type: 'enemy-fired', shellId: shell.id, shipId: ship.id });
  }
}

export function step(state: Battle, dtSeconds: number): BattleEvent[] {
  if (
    state.status !== 'playing' ||
    !Number.isFinite(dtSeconds) ||
    dtSeconds <= 0
  ) {
    return [];
  }

  const dt = Math.min(dtSeconds, 0.25);
  const events: BattleEvent[] = [];
  state.time += dt;
  state.reload = Math.max(0, state.reload - dt);
  moveShips(state, dt);
  updateShells(state, dt, events);
  if (state.status === 'playing') launchEnemyShells(state, dt, events);
  return events;
}
