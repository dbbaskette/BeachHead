import type { Aircraft, AirBattle, AirInput, Vec3 } from './types';
export const SPEED = 65;
export const CORRIDOR = 220;
export const MIN_ALTITUDE = 34;
export const MAX_ALTITUDE = 140;
export const PASS_SECONDS = 40;
export const CENTERS = [-170, 130, -190];
export const GUNS: readonly Vec3[] = [
  { x: -5.2, y: -0.15, z: -1.4 },
  { x: 5.2, y: -0.15, z: -1.4 },
];
export const RACKS: readonly Vec3[] = [
  { x: -3.8, y: -1.35, z: 0.4 },
  { x: 3.8, y: -1.35, z: 0.4 },
];
export const clamp = (n: number, a: number, b: number) =>
  Math.min(b, Math.max(a, Number.isFinite(n) ? n : 0));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function rotate(
  v: Vec3,
  f: Pick<Aircraft, 'heading' | 'pitch' | 'bank'>,
): Vec3 {
  const c = Math.cos(f.bank),
    s = Math.sin(f.bank),
    x = v.x * c - v.y * s,
    y = v.x * s + v.y * c;
  const p = Math.cos(f.pitch),
    q = Math.sin(f.pitch),
    yy = y * p - v.z * q,
    z = y * q + v.z * p;
  return {
    x: x * Math.cos(f.heading) - z * Math.sin(f.heading),
    y: yy,
    z: x * Math.sin(f.heading) + z * Math.cos(f.heading),
  };
}
export function hardpoint(f: Aircraft, local: Vec3): Vec3 {
  const r = rotate(local, f);
  return {
    x: r.x + f.position.x,
    y: r.y + f.position.y,
    z: r.z + f.position.z,
  };
}
export function createAircraft(): Aircraft {
  return {
    position: { x: CENTERS[0], y: 85, z: 1690 },
    velocity: { x: 0, y: 0, z: -SPEED },
    heading: 0,
    pitch: 0,
    bank: 0,
    offset: 0,
    desiredOffset: 0,
    desiredAltitude: 85,
    lateralSpeed: 0,
  };
}
export function steerRelative(
  b: AirBattle,
  dx: number,
  dy: number,
  precision = false,
) {
  if (b.status !== 'playing' || !['approach', 'attack'].includes(b.phase))
    return;
  const gain = precision ? 0.3 : 1;
  b.aircraft.desiredOffset = clamp(
    b.aircraft.desiredOffset + clamp(dx, -150, 150) * 0.8 * gain,
    -CORRIDOR,
    CORRIDOR,
  );
  b.aircraft.desiredAltitude = clamp(
    b.aircraft.desiredAltitude - clamp(dy, -150, 150) * 0.3 * gain,
    MIN_ALTITUDE,
    MAX_ALTITUDE,
  );
}
export function settleFlight(b: AirBattle) {
  b.aircraft.desiredOffset = b.aircraft.offset;
  b.aircraft.desiredAltitude = b.aircraft.position.y;
}
export function fly(b: AirBattle, input: AirInput, dt: number) {
  const f = b.aircraft,
    route = b.pass === 1 ? Math.PI : 0;
  if (b.phase === 'turn') {
    const t = clamp(b.phaseTime / 6, 0, 1),
      ease = t * t * (3 - 2 * t),
      next = b.pass + 1;
    const z = next === 1 ? -1300 : 1300;
    f.position = {
      x: mix(b.turnFrom.x, CENTERS[next], ease),
      y: mix(b.turnFrom.y, 85, ease),
      z: z + (next === 1 ? -1 : 1) * Math.sin(Math.PI * t) * 180,
    };
    f.heading = b.turnHeading + Math.PI * ease;
    f.bank = -Math.sin(Math.PI * t) * 0.5;
    f.pitch = 0;
    f.velocity = { x: 0, y: 0, z: 0 };
    return;
  }
  if (b.phase !== 'exit') {
    f.desiredOffset = clamp(
      f.desiredOffset + clamp(input.x, -1, 1) * 65 * dt,
      -CORRIDOR,
      CORRIDOR,
    );
    f.desiredAltitude = clamp(
      f.desiredAltitude + clamp(input.y, -1, 1) * 24 * dt,
      MIN_ALTITUDE,
      MAX_ALTITUDE,
    );
  }
  const desired = clamp((f.desiredOffset - f.offset) * 2.4, -45, 45);
  f.lateralSpeed = mix(f.lateralSpeed, desired, 1 - Math.exp(-dt * 5));
  const vy = clamp((f.desiredAltitude - f.position.y) * 2, -20, 20);
  f.offset = clamp(f.offset + f.lateralSpeed * dt, -CORRIDOR, CORRIDOR);
  f.position.x = CENTERS[b.pass] + Math.cos(route) * f.offset;
  f.position.y = clamp(f.position.y + vy * dt, MIN_ALTITUDE, MAX_ALTITUDE);
  f.position.z -= Math.cos(route) * SPEED * dt;
  f.velocity = {
    x: Math.cos(route) * f.lateralSpeed,
    y: vy,
    z: -Math.cos(route) * SPEED,
  };
  f.heading = route + Math.atan2(f.lateralSpeed, SPEED) * 0.55;
  f.pitch = mix(f.pitch, Math.atan2(vy, SPEED), 1 - Math.exp(-dt * 4));
  f.bank = mix(f.bank, -f.lateralSpeed / 90, 1 - Math.exp(-dt * 5));
}
