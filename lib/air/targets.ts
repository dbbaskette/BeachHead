import type { AirBattle, AirEvent, AirTarget, TargetKind, Vec3 } from './types';
export const shoreline = (z: number) =>
  Math.sin(z * 0.0025) * 24 + Math.sin(z * 0.009) * 6;
export function terrainHeight(x: number, z: number) {
  const land = x - shoreline(z);
  if (land < 0) return 0;
  return (
    Math.min(5, land * 0.024) +
    Math.max(0, Math.min(1, (land - 95) / 180)) *
      (7 + 4 * Math.sin(z * 0.006) * Math.sin(x * 0.012)) +
    Math.max(0, Math.min(1, (land - 370) / 500)) *
      (40 + 23 * Math.sin(z * 0.003) * Math.sin(x * 0.006))
  );
}
const defs: Record<TargetKind, { half: Vec3; health: number; score: number }> =
  {
    craft: { half: { x: 14, y: 5, z: 6 }, health: 58, score: 180 },
    carrier: { half: { x: 21, y: 7, z: 10 }, health: 100, score: 260 },
    truck: { half: { x: 3, y: 3, z: 6 }, health: 22, score: 80 },
    supply: { half: { x: 12, y: 4, z: 12 }, health: 45, score: 120 },
    flak: { half: { x: 7, y: 4, z: 7 }, health: 35, score: 240 },
    command: { half: { x: 28, y: 17, z: 62 }, health: 330, score: 1500 },
  };
export function makeTarget(
  kind: TargetKind,
  id: string,
  x: number,
  z: number,
): AirTarget {
  const { half, health } = defs[kind];
  return {
    id,
    kind,
    position: { x, y: terrainHeight(x, z), z },
    velocity: {
      x:
        kind === 'craft' || kind === 'carrier'
          ? 2.4
          : kind === 'command'
            ? 1.4
            : 0,
      y: 0,
      z: kind === 'truck' ? 4 : 0,
    },
    half: { ...half },
    health,
    maxHealth: health,
    active: kind !== 'command',
    destroyedAt: null,
    damageOffset: null,
    nextFire: 8,
    unload: 0,
    cargo: kind === 'carrier' ? 3 : 0,
    heading:
      kind === 'craft' || kind === 'carrier'
        ? Math.PI / 2
        : kind === 'truck'
          ? Math.PI
          : 0,
  };
}
export function createTargets() {
  const targets: AirTarget[] = [];
  for (let i = 0; i < 8; i++)
    targets.push(
      makeTarget(
        'craft',
        `craft-${i}`,
        -330 + (i % 3) * 90,
        930 - Math.floor(i / 2) * 500 + (i % 2) * 95,
      ),
    );
  for (let i = 0; i < 3; i++)
    targets.push(makeTarget('carrier', `carrier-${i}`, -92, 800 - i * 760));
  for (let i = 0; i < 4; i++) {
    const flak = makeTarget(
      'flak',
      `flak-${i}`,
      65 + (i % 2) * 85,
      900 - i * 570,
    );
    flak.nextFire += i * 0.9;
    targets.push(flak);
    targets.push(
      makeTarget('truck', `truck-${i}`, 155 + (i % 2) * 50, 780 - i * 480),
    );
    targets.push(
      makeTarget('supply', `supply-${i}`, 225 + (i % 2) * 55, 640 - i * 460),
    );
  }
  targets.push(makeTarget('command', 'command', -245, -600));
  return targets;
}
export function targetFuture(t: AirTarget, seconds: number): Vec3 {
  const p = {
    x: t.position.x + t.velocity.x * seconds,
    y: t.position.y,
    z: t.position.z + t.velocity.z * seconds,
  };
  if (t.kind === 'craft' || t.kind === 'carrier')
    p.x = Math.min(p.x, shoreline(p.z) - 16);
  if (t.kind === 'command') p.x = Math.min(p.x, -110);
  p.y = terrainHeight(p.x, p.z);
  return p;
}
export function updateTargets(b: AirBattle, dt: number) {
  const cargo: AirTarget[] = [];
  for (const t of b.targets) {
    if (!t.active || t.health <= 0) continue;
    const next = targetFuture(t, dt);
    if (next.x === t.position.x) t.velocity.x = 0;
    t.position = next;
    if (t.kind === 'carrier' && t.velocity.x === 0 && t.cargo > 0) {
      t.unload += dt;
      if (t.unload >= 4) {
        t.unload = 0;
        t.cargo--;
        cargo.push(
          makeTarget(
            'truck',
            `${t.id}-cargo-${t.cargo}`,
            shoreline(t.position.z) + 25,
            t.position.z,
          ),
        );
      }
    }
  }
  b.targets.push(...cargo);
}
export function damageTarget(
  b: AirBattle,
  t: AirTarget,
  damage: number,
  events: AirEvent[],
  impact?: Vec3,
) {
  if (!t.active || t.health <= 0) return;
  t.health = Math.max(0, t.health - damage);
  if (impact)
    t.damageOffset = {
      x: Math.max(-t.half.x, Math.min(t.half.x, impact.x - t.position.x)),
      y: Math.max(3, Math.min(t.half.y * 2, impact.y - t.position.y)),
      z: Math.max(-t.half.z, Math.min(t.half.z, impact.z - t.position.z)),
    };
  if (t.health === 0) {
    t.destroyedAt = b.time;
    t.velocity = { x: 0, y: 0, z: 0 };
    b.destroyed++;
    b.score += defs[t.kind].score;
    b.deniedCargo += t.cargo;
    b.score += t.cargo * 80;
    t.cargo = 0;
    events.push({
      type: 'destroyed',
      position: impact ? { ...impact } : { ...t.position },
      kind: t.kind,
    });
  }
}
export function bombBlast(b: AirBattle, p: Vec3, events: AirEvent[]) {
  for (const t of b.targets) {
    const dx = Math.max(0, Math.abs(t.position.x - p.x) - t.half.x),
      dz = Math.max(0, Math.abs(t.position.z - p.z) - t.half.z);
    const d = Math.hypot(dx, dz);
    if (d < 54) damageTarget(b, t, 220 * (1 - d / 65), events, p);
  }
}
